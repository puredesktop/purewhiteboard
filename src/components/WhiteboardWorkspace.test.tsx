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
