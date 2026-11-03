import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultWhiteboardScene, parseWhiteboardScene, serializeWhiteboardScene, type WhiteboardSceneDocument } from './whiteboardPackage'
import type { WhiteboardElementLike } from './whiteboardScene'
import { SharedScene, type SharedScenePort } from './whiteboardSharedScene'

/**
 * Two live copies of PureWhiteboard over one package, each drawing, saving and hearing of the other's saves as the
 * workspace does. Every read and write takes a turn of the event loop, and a conditional write follows the shell's rule.
 */
const PATH = '/Documents/board.whiteboard'
const shape = (id: string, version = 1): WhiteboardElementLike => ({ id, type: 'rectangle', x: 0, y: 0, version, versionNonce: version })

let disk: string | null
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const listeners = new Set<{ name: string; hear: () => Promise<void> }>()

function copy(name: string) {
  const port: SharedScenePort = {
    read: async () => { await tick(); return disk },
    writeIfUnchanged: async (_path, text, expected) => {
      await tick()
      const actual = disk ? (JSON.parse(disk) as { revision?: string }).revision ?? null : null
      if (actual !== expected) throw new Error('Save conflict: this document changed in another window.')
      disk = text
      for (const other of listeners) if (other.name !== name) void other.hear()
    },
    writeNew: async (_path, text) => { await tick(); disk = text },
  }
  const shared = new SharedScene(port)
  const start = parseWhiteboardScene(disk!)
  shared.bindText(PATH, disk, start)
  let live: WhiteboardSceneDocument = start
  let turns: Promise<unknown> = Promise.resolve()
  const inTurn = (work: () => Promise<void>) => { const next = turns.then(work, work); turns = next; return next }
  const handle = {
    name,
    live: () => live,
    draw: (change: (elements: WhiteboardElementLike[]) => WhiteboardElementLike[]) => { live = { ...live, elements: change([...live.elements]) } },
    drawFile: (id: string) => { live = { ...live, files: { ...live.files, [id]: { id } } } },
    save: () => inTurn(async () => {
      const saved = await shared.save(PATH, live, true)
      if (saved.merged) live = saved.scene
    }),
    hear: () => inTurn(async () => {
      const merged = await shared.takeIn(PATH, () => live)
      if (!merged) return
      live = merged.scene
      if (merged.unsaved) { const saved = await shared.save(PATH, live, true); if (saved.merged) live = saved.scene }
    }),
    settled: () => turns,
  }
  listeners.add(handle)
  return handle
}
const onDisk = () => parseWhiteboardScene(disk!)
const ids = (scene: WhiteboardSceneDocument) => scene.elements.map(element => element.id).sort()
const settle = async (...copies: { settled: () => Promise<unknown> }[]) => {
  for (let round = 0; round < 4; round++) {
    await new Promise(resolve => setTimeout(resolve, 2))
    await Promise.all(copies.map(item => item.settled()))
  }
}
beforeEach(() => {
  listeners.clear()
  disk = serializeWhiteboardScene({ ...createDefaultWhiteboardScene(), elements: [shape('one'), shape('two')] })
})

describe('two copies, one after the other', () => {
  it('a shape drawn in one appears in the other, and the other\'s next save keeps it', async () => {
    const a = copy('a'), b = copy('b')
    a.draw(elements => [...elements, shape('from-a')])
    await a.save(); await settle(a, b)
    expect(ids(b.live())).toContain('from-a')
    b.draw(elements => [...elements, shape('from-b')])
    await b.save(); await settle(a, b)
    expect(ids(onDisk())).toEqual(['from-a', 'from-b', 'one', 'two'])
    expect(ids(a.live())).toEqual(['from-a', 'from-b', 'one', 'two'])
  })

  it('a copy that has not looked at the board for an hour takes nothing away by saving', async () => {
    const a = copy('a'), stale = copy('b')
    listeners.delete(stale as never)
    a.draw(elements => [...elements, shape('from-a')])
    await a.save(); await settle(a)
    stale.draw(elements => [...elements, shape('from-stale')])
    await stale.save(); await settle(stale)
    expect(ids(onDisk())).toEqual(['from-a', 'from-stale', 'one', 'two'])
  })

  it('a shape removed in one stays removed when the other saves', async () => {
    const a = copy('a'), b = copy('b')
    listeners.clear()
    a.draw(elements => elements.filter(element => element.id !== 'two'))
    await a.save(); await settle(a)
    b.draw(elements => [...elements, shape('from-b')])
    await b.save(); await settle(b)
    expect(ids(onDisk())).toEqual(['from-b', 'one'])
  })
})

describe('two copies at the same moment', () => {
  it('both draw: both stay, on disk and on each screen', async () => {
    const a = copy('a'), b = copy('b')
    a.draw(elements => [...elements, shape('from-a')])
    b.draw(elements => [...elements, shape('from-b')])
    await Promise.all([a.save(), b.save()])
    await settle(a, b)
    for (const scene of [onDisk(), a.live(), b.live()]) expect(ids(scene)).toEqual(['from-a', 'from-b', 'one', 'two'])
  })

  it('both move one shape: the one changed more stays, and both end agreeing', async () => {
    const a = copy('a'), b = copy('b')
    a.draw(elements => elements.map(element => (element.id === 'one' ? { ...element, x: 10, version: 3, versionNonce: 3 } : element)))
    b.draw(elements => elements.map(element => (element.id === 'one' ? { ...element, x: 20, version: 2, versionNonce: 2 } : element)))
    await Promise.all([a.save(), b.save()])
    await settle(a, b)
    expect(onDisk().elements.find(element => element.id === 'one')?.x).toBe(10)
    expect(a.live().elements.find(element => element.id === 'one')?.x).toBe(10)
    expect(b.live().elements.find(element => element.id === 'one')?.x).toBe(10)
  })

  it('one removes a shape while the other changes it: the change stays', async () => {
    const a = copy('a'), b = copy('b')
    a.draw(elements => elements.filter(element => element.id !== 'one'))
    b.draw(elements => elements.map(element => (element.id === 'one' ? { ...element, x: 5, version: 2, versionNonce: 2 } : element)))
    await Promise.all([a.save(), b.save()])
    await settle(a, b)
    expect(onDisk().elements.find(element => element.id === 'one')?.x).toBe(5)
  })

  it('both add an image: both files stay', async () => {
    const a = copy('a')
    listeners.clear()
    disk = serializeWhiteboardScene({ ...onDisk(), files: { theirs: { id: 'theirs' } }, revision: 'other' } as WhiteboardSceneDocument)
    a.drawFile('mine')
    await a.save()
    expect(Object.keys(onDisk().files ?? {}).sort()).toEqual(['mine', 'theirs'])
  })
})

describe('what does not change', () => {
  it('hearing of a change with nothing new does nothing', async () => {
    const a = copy('a')
    await a.hear()
    expect(ids(a.live())).toEqual(['one', 'two'])
  })

  it('a save with no other copy about writes what it was given', async () => {
    const a = copy('a')
    a.draw(elements => [...elements, shape('mine')])
    await a.save()
    expect(ids(onDisk())).toEqual(['mine', 'one', 'two'])
    expect(onDisk().elements.map(element => element.id)).toEqual(['one', 'two', 'mine'])
  })
})
