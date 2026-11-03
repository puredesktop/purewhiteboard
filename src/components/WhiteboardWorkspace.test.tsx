// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  files: new Map<string, string>(),
  fail: false,
  count: 0,
  context: null as any,
  change: null as any,
  switcher: null as any,
  documentChanged: null as any,
  elements: [] as any[],
  adopt: vi.fn(),
  updateScene: vi.fn(),
  scrollToContent: vi.fn(),
  bind: vi.fn(async () => undefined),
}))
vi.mock('../lib/bindWhiteboardDocument', () => ({
  bindWhiteboardDocument: mock.bind,
}))
vi.mock('../hooks/usePureWhiteboardAgentTools', () => ({
  usePureWhiteboardAgentTools: (_: unknown, context: unknown) => {
    mock.context = context
  },
}))
vi.mock('../bridge/platformBridge', () => ({
  readTextFile: vi.fn(async (path: string) => {
    if (!mock.files.has(path)) throw new Error('ENOENT: no such file')
    return mock.files.get(path)!
  }),
  writeTextFile: vi.fn(async (path: string, text: string) => {
    if (mock.fail) throw new Error('disk full')
    mock.files.set(path, text)
  }),
  writeBinaryFile: vi.fn(),
  updateWhiteboardSettings: vi.fn(async () => undefined),
}))
vi.mock('@purescience/platform-ui/bridge/documents.mjs', () => ({
  onPlatformDocumentsChanged: (listener: any) => {
    mock.documentChanged = listener
    return () => {}
  },
  autosavePlatformDocument: async (request: any) => {
    if (mock.fail) throw new Error('disk full')
    if (request.revision) {
      const text = mock.files.get(`${request.path}/${request.revision.file}`)
      const actual = text ? JSON.parse(text)[request.revision.field] ?? null : null
      if (actual !== request.revision.expected) throw new Error('Save conflict: this document changed in another window.')
    }
    request.files.forEach((file: any) => mock.files.set(`${request.path}/${file.name}`, file.content))
    return { savedAt: 'now' }
  },
  createPlatformDraft: async (request: any) => {
    const path = `/Drafts/Board ${++mock.count}.whiteboard`
    request.files.forEach((file: any) =>
      mock.files.set(`${path}/${file.name}`, file.content),
    )
    return { path }
  },
}))
vi.mock('@purescience/platform-ui/bridge/react/useDocumentLifecycle', () => ({
  useDocumentLifecycle: () => ({ adopt: mock.adopt }),
}))
vi.mock(
  '@purescience/platform-bridge/components/AppFrame',
  () => ({
    AppFrame: ({ children, headerActions, headerDocumentName }: any) => (
      <>
        <header>
          {headerDocumentName}
          {headerActions}
        </header>
        {children}
      </>
    ),
  }),
)
vi.mock('@purescience/platform-ui/components/common/documents', () => ({
  DocumentHeaderActions: ({ onOpenSwitcher }: any) => (
    <button onClick={onOpenSwitcher}>Documents</button>
  ),
  DocumentSwitcher: (props: any) => {
    mock.switcher = props
    return props.open ? <div role="dialog">{props.openError}</div> : null
  },
}))
vi.mock('@excalidraw/excalidraw', () => {
  const Wrapper = ({ children }: any) => children
  const Empty = () => null
  return {
    Excalidraw: ({ excalidrawAPI, initialData, onChange }: any) => {
      mock.change = onChange
      useEffect(() => {
        mock.elements = initialData.elements
        excalidrawAPI({
          getSceneElements: () => mock.elements,
          getAppState: () => ({}),
          getFiles: () => ({}),
          updateScene: (scene: any) => { mock.updateScene(scene); mock.elements = [...scene.elements] },
          scrollToContent: mock.scrollToContent,
        })
      }, [])
      return <div>Canvas</div>
    },
    MainMenu: Object.assign(Wrapper, {
      DefaultItems: {
        ClearCanvas: Empty,
        ChangeCanvasBackground: Empty,
        Help: Empty,
      },
      Separator: Empty,
    }),
    WelcomeScreen: Object.assign(Wrapper, {
      Center: Object.assign(Wrapper, { Heading: Wrapper }),
      Hints: { ToolbarHint: Empty },
    }),
    exportToBlob: vi.fn(),
    CaptureUpdateAction: { NEVER: 'NEVER' },
  }
})
import { WhiteboardWorkspace } from './WhiteboardWorkspace'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
let root: ReturnType<typeof createRoot>
let host: HTMLDivElement
beforeEach(async () => {
  mock.files.clear()
  mock.fail = false
  mock.count = 0
  mock.bind.mockClear()
  host = document.createElement('div')
  root = createRoot(host)
  await act(async () =>
    root.render(
      <WhiteboardWorkspace
        ready
        boot={
          {
            prefs: { workingDirectory: '/test' },
            appSettings: { packagePath: '/test/initial.whiteboard' },
          } as any
        }
        resource={null}
        onResourceHandled={() => {}}
      />,
    ),
  )
})
afterEach(async () => {
  mock.fail = false
  await act(async () => root.unmount())
})
it('creates distinct packages and reopens the saved identity', async () => {
  let first = '',
    second = ''
  await act(async () => {
    first = await mock.context.create('First')
  })
  await act(async () => {
    second = await mock.context.create('Second')
  })
  expect(first).not.toBe(second)
  await act(async () => mock.context.open(first))
  expect(mock.context.document.packagePath).toBe(first)
  expect(mock.bind).toHaveBeenLastCalledWith(first)
  expect(host.textContent).toContain('Board 1')
})
it('blocks document browsing on failed outgoing save and saves before opening on retry', async () => {
  mock.elements = [
    { id: 'shape', type: 'rectangle', version: 1, versionNonce: 1 },
  ]
  await act(async () => mock.change(mock.elements, {}, {}))
  mock.fail = true
  await act(async () => host.querySelector('button')!.click())
  expect(mock.switcher.open).toBe(false)
  expect(host.textContent).toContain('disk full')
  mock.fail = false
  await act(async () => host.querySelector('button')!.click())
  expect(mock.switcher.open).toBe(true)
  expect(
    JSON.parse(
      mock.files.get('/test/initial.whiteboard/whiteboard.whiteboard.json')!,
    ).elements[0].id,
  ).toBe('shape')
})
it('rejects corrupt input without abandoning the current board', async () => {
  mock.files.set('/bad.whiteboard/whiteboard.whiteboard.json', '{broken')
  await act(async () => {
    await expect(mock.context.open('/bad.whiteboard')).rejects.toThrow()
  })
  expect(mock.context.document.packagePath).toBe('/test/initial.whiteboard')
  expect(mock.bind).not.toHaveBeenCalled()
})

it('follows browser renames without recreating the old package', async () => {
  let path = ''
  await act(async () => {
    path = await mock.context.create('Rename me')
  })
  const renamed = '/Drafts/Renamed.whiteboard'
  for (const [key, value] of [...mock.files])
    if (key.startsWith(path + '/')) {
      mock.files.set(key.replace(path, renamed), value)
      mock.files.delete(key)
    }
  await act(async () =>
    mock.documentChanged({
      kind: 'renamed',
      path: renamed,
      previousPath: path,
    }),
  )
  expect(mock.context.document.packagePath).toBe(renamed)
  expect([...mock.files.keys()].some(key => key.startsWith(path + '/'))).toBe(
    false,
  )
  expect(mock.bind).toHaveBeenLastCalledWith(renamed)
})

it('takes in another copy\'s save: its shape comes onto the canvas and nothing is written back', async () => {
  const scenePath = '/Drafts/Board 1.whiteboard/whiteboard.whiteboard.json'
  await act(async () => { await mock.context.create('Board') })
  const shape = (id: string) => ({ id, type: 'rectangle', x: 0, y: 0, version: 1, versionNonce: 1 })
  mock.updateScene.mockClear()
  mock.files.set(scenePath, JSON.stringify({ schemaVersion: 1, type: 'whiteboard.scene', elements: [shape('theirs')], appState: {}, files: {}, updatedAt: 'now', revision: 'other' }))
  const before = mock.files.get(scenePath)
  await act(async () => {
    mock.documentChanged({ kind: 'content', path: scenePath })
    await new Promise(resolve => setTimeout(resolve, 5))
  })
  expect(mock.updateScene.mock.calls.at(-1)?.[0].elements.map((element: any) => element.id)).toEqual(['theirs'])
  expect(mock.files.get(scenePath)).toBe(before)
})

it('a save refused because another copy saved first merges and saves both', async () => {
  const scenePath = '/Drafts/Board 1.whiteboard/whiteboard.whiteboard.json'
  await act(async () => { await mock.context.create('Board') })
  const shape = (id: string) => ({ id, type: 'rectangle', x: 0, y: 0, version: 1, versionNonce: 1 })
  // Written with no revision yet in this copy's eyes: the other copy got there first.
  mock.files.set(scenePath, JSON.stringify({ schemaVersion: 1, type: 'whiteboard.scene', elements: [shape('theirs')], appState: {}, files: {}, updatedAt: 'now', revision: 'other' }))
  mock.elements = [shape('mine')]
  await act(async () => {
    mock.change(mock.elements, {}, {})
    await mock.context.save()
  })
  expect(JSON.parse(mock.files.get(scenePath)!).elements.map((element: any) => element.id).sort()).toEqual(['mine', 'theirs'])
})
