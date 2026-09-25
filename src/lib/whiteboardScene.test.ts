import { describe, expect, it, vi } from 'vitest'

let nextId = 0

/**
 * A small model of `convertToExcalidrawElements` that keeps the behaviour
 * the app depends on: ids regenerate unless `regenerateIds: false`; spread
 * elements keep their props; a `label` becomes a bound text element; an
 * arrow's `start.id` / `end.id` bind ONLY to elements in the same batch.
 */
vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY' },
  convertToExcalidrawElements: (
    specs: Array<Record<string, unknown>>,
    opts?: { regenerateIds: boolean },
  ): WhiteboardElementLike[] => {
    const labels = new Map<number, string>()
    const batch: WhiteboardElementLike[] = specs.map((spec, index) => {
      // `label` is a skeleton-only key; newElement never keeps it.
      const { label, ...rest } = spec as Record<string, unknown> & {
        label?: { text?: string }
      }
      if (label?.text) labels.set(index, label.text)
      return rest as Record<string, unknown>
    }).map((spec, index) => ({
      ...spec,
      id:
        opts?.regenerateIds === false && typeof spec.id === 'string'
          ? spec.id
          : `element-${(nextId += 1)}`,
      type: String(spec.type),
      x: Number(spec.x ?? 0),
      y: Number(spec.y ?? 0),
      width: Number(spec.width ?? 0),
      height: Number(spec.height ?? 0),
      text: typeof spec.text === 'string' ? spec.text : undefined,
      version: typeof spec.version === 'number' ? spec.version : 1,
    }))
    const out: WhiteboardElementLike[] = []
    const byId = new Map(batch.map(element => [element.id, element]))
    batch.forEach((element, index) => {
      out.push(element)
      const label = labels.get(index)
      if (label) {
        const text: WhiteboardElementLike = {
          id: `element-${(nextId += 1)}`,
          type: 'text',
          x: element.x,
          y: element.y,
          width: 40,
          height: 20,
          text: label,
          containerId: element.id,
        }
        element.boundElements = [
          ...(element.boundElements ?? []),
          { id: text.id, type: 'text' },
        ]
        out.push(text)
      }
      if (element.type === 'arrow') {
        for (const end of ['start', 'end'] as const) {
          const ref = (element as Record<string, { id?: string } | undefined>)[
            end
          ]
          const target = ref?.id ? byId.get(ref.id) : undefined
          if (!target) continue
          element[`${end}Binding`] = { elementId: target.id }
          target.boundElements = [
            ...(target.boundElements ?? []),
            { id: element.id, type: 'arrow' },
          ]
        }
      }
    })
    return out
  },
}))
import {
  addWhiteboardShape,
  addWhiteboardText,
  clearWhiteboard,
  connectWhiteboardElements,
  getWhiteboardContext,
  nextFreePosition,
  removeWhiteboardElement,
  styleWhiteboardElement,
  whiteboardSceneFingerprint,
  type WhiteboardApiLike,
  type WhiteboardElementLike,
} from './whiteboardScene'

function mockApi(
  initial: WhiteboardElementLike[] = [],
  appState: Record<string, unknown> = {},
): {
  api: WhiteboardApiLike
  elements: () => WhiteboardElementLike[]
  updates: () => Array<{ captureUpdate?: string }>
} {
  let elements = initial
  const updates: Array<{ captureUpdate?: string }> = []
  return {
    api: {
      getSceneElements: () => elements,
      getAppState: () => appState,
      updateScene: scene => {
        elements = [...scene.elements]
        updates.push({ captureUpdate: scene.captureUpdate })
      },
      scrollToContent: () => undefined,
    },
    elements: () => elements,
    updates: () => updates,
  }
}

describe('whiteboard scene tools', () => {
  it('adds labelled shapes and text', () => {
    const { api, elements, updates } = mockApi()

    const shape = addWhiteboardShape(api, {
      shape: 'rectangle',
      label: 'Frontend',
    })
    const text = addWhiteboardText(api, { text: 'Launch plan', y: 20 })

    expect(shape.type).toBe('rectangle')
    expect(text.type).toBe('text')
    // the rectangle, its bound label, and the free text
    expect(elements()).toHaveLength(3)
    // agent edits are captured immediately so ⌘Z undoes them
    expect(updates().every(u => u.captureUpdate === 'IMMEDIATELY')).toBe(true)
  })

  it('places new elements clear of existing content when no position is given', () => {
    expect(nextFreePosition([])).toEqual({ x: 120, y: 120 })
    const { api } = mockApi()
    const first = addWhiteboardShape(api, { shape: 'rectangle', x: 0, y: 50, width: 100 })
    const second = addWhiteboardShape(api, { shape: 'ellipse' })
    expect(second.x).toBe(first.x + 100 + 40)
    expect(second.y).toBe(50)
    const note = addWhiteboardText(api, { text: 'note' })
    expect(note.x).toBe(second.x + 180 + 40)
  })

  it('connects with a real binding on both ends', () => {
    const { api, elements } = mockApi()
    const a = addWhiteboardShape(api, { shape: 'rectangle', x: 0 })
    const b = addWhiteboardShape(api, { shape: 'ellipse', x: 320 })

    const arrow = connectWhiteboardElements(api, {
      fromId: a.id,
      toId: b.id,
      label: 'API',
    })

    expect(arrow.type).toBe('arrow')
    expect(arrow.startBinding).toMatchObject({ elementId: a.id })
    expect(arrow.endBinding).toMatchObject({ elementId: b.id })
    const from = elements().find(element => element.id === a.id)
    const to = elements().find(element => element.id === b.id)
    expect(from?.boundElements).toContainEqual({ id: arrow.id, type: 'arrow' })
    expect(to?.boundElements).toContainEqual({ id: arrow.id, type: 'arrow' })
    // endpoints stay in place (same ids, not duplicated), arrow + label appended
    expect(elements().map(element => element.id)).toEqual([
      a.id,
      b.id,
      arrow.id,
      expect.any(String),
    ])
    expect(elements().at(-1)).toMatchObject({ type: 'text', text: 'API', containerId: arrow.id })
  })

  it('refuses to connect an arrow to an arrow or an element to itself', () => {
    const { api } = mockApi()
    const a = addWhiteboardShape(api, { shape: 'rectangle', x: 0 })
    const b = addWhiteboardShape(api, { shape: 'diamond', x: 300 })
    const arrow = connectWhiteboardElements(api, { fromId: a.id, toId: b.id })

    expect(() =>
      connectWhiteboardElements(api, { fromId: arrow.id, toId: b.id }),
    ).toThrow(/is a arrow/)
    expect(() =>
      connectWhiteboardElements(api, { fromId: a.id, toId: a.id }),
    ).toThrow(/different/)
    expect(() =>
      connectWhiteboardElements(api, { fromId: a.id, toId: 'nope' }),
    ).toThrow(/getWhiteboardContext/)
  })

  it('removes an element with its label and unhooks what pointed at it', () => {
    const { api, elements } = mockApi()
    const a = addWhiteboardShape(api, { shape: 'rectangle', label: 'A' })
    const b = addWhiteboardShape(api, { shape: 'rectangle', label: 'B', x: 400 })
    const arrow = connectWhiteboardElements(api, { fromId: a.id, toId: b.id })

    const removed = removeWhiteboardElement(api, { id: a.id })

    expect(removed).toContain(a.id)
    expect(removed).toHaveLength(2)
    const ids = elements().map(element => element.id)
    expect(ids).not.toContain(a.id)
    expect(elements().some(element => element.containerId === a.id)).toBe(false)
    const survivor = elements().find(element => element.id === arrow.id)
    expect(survivor?.startBinding).toBeNull()
    expect(survivor?.endBinding).toMatchObject({ elementId: b.id })

    removeWhiteboardElement(api, { id: arrow.id })
    const target = elements().find(element => element.id === b.id)
    expect(target?.boundElements?.some(bound => bound.id === arrow.id)).toBe(false)
    expect(() => removeWhiteboardElement(api, { id: 'ghost' })).toThrow(/No element/)
  })

  it('restyles one element and bumps its version', () => {
    const { api, elements } = mockApi()
    const a = addWhiteboardShape(api, { shape: 'rectangle' })

    const styled = styleWhiteboardElement(api, {
      id: a.id,
      backgroundColor: '#ffd166',
      strokeWidth: 4,
      opacity: 250,
    })

    expect(styled).toMatchObject({
      id: a.id,
      backgroundColor: '#ffd166',
      strokeWidth: 4,
      opacity: 100,
      version: (a.version ?? 0) + 1,
    })
    expect(elements().find(element => element.id === a.id)).toBe(styled)
    expect(() => styleWhiteboardElement(api, { id: a.id })).toThrow(/Nothing to change/)
  })

  it('reports labels, bindings and selection in context', () => {
    const { api } = mockApi([], { selectedElementIds: { x: true, y: false } })
    const a = addWhiteboardShape(api, { shape: 'rectangle', label: 'Login' })
    const b = addWhiteboardShape(api, { shape: 'ellipse', x: 400, backgroundColor: '#eee' })
    const arrow = connectWhiteboardElements(api, { fromId: a.id, toId: b.id, label: 'ok' })
    addWhiteboardText(api, { text: 'A note' })

    const context = getWhiteboardContext(api)

    expect(context.elementCount).toBe(4)
    expect(context.truncated).toBe(false)
    expect(context.selectedElementIds).toEqual(['x'])
    expect(context.elements).toEqual([
      expect.objectContaining({ id: a.id, type: 'rectangle', text: 'Login' }),
      expect.objectContaining({ id: b.id, type: 'ellipse', backgroundColor: '#eee' }),
      expect.objectContaining({ id: arrow.id, type: 'arrow', text: 'ok', from: a.id, to: b.id }),
      expect.objectContaining({ type: 'text', text: 'A note' }),
    ])
    // bound labels are folded into their containers, never listed on their own
    expect(context.elements.some(element => element.text === 'Login' && element.type === 'text')).toBe(false)
  })

  it('clears only with explicit confirmation', () => {
    const { api, elements } = mockApi()
    expect(clearWhiteboard(api)).toBe(0)
    addWhiteboardText(api, { text: 'A note' })
    addWhiteboardShape(api, { shape: 'diamond' })

    expect(() => clearWhiteboard(api)).toThrow(/holds 2 elements/)
    expect(() => clearWhiteboard(api, { confirm: 'yes' })).toThrow(/confirm: true/)
    expect(elements()).toHaveLength(2)

    expect(clearWhiteboard(api, { confirm: true })).toBe(2)
    expect(elements()).toEqual([])
  })

  it('fingerprints the drawing, not the viewport', () => {
    const elements: WhiteboardElementLike[] = [
      { id: 'a', type: 'rectangle', x: 0, y: 0, version: 3 },
    ]
    const base = whiteboardSceneFingerprint(elements, { viewBackgroundColor: '#fff', scrollX: 0, zoom: { value: 1 } })
    expect(whiteboardSceneFingerprint(elements, { viewBackgroundColor: '#fff', scrollX: 500, zoom: { value: 2 }, selectedElementIds: { a: true } })).toBe(base)
    expect(whiteboardSceneFingerprint([{ ...elements[0], version: 4 }], { viewBackgroundColor: '#fff' })).not.toBe(base)
    expect(whiteboardSceneFingerprint([{ ...elements[0], isDeleted: true, version: 4 }], { viewBackgroundColor: '#fff' })).not.toBe(base)
    expect(whiteboardSceneFingerprint(elements, { viewBackgroundColor: '#000' })).not.toBe(base)
  })
})
