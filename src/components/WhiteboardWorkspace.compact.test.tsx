// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAdjacentApp } from '@purescience/platform-ui/bridge/react/useAdjacentApp'

const mock = vi.hoisted(() => ({
  files: new Map<string, string>(),
  scrollToContent: vi.fn(),
  mounts: 0,
  settings: vi.fn(async () => undefined),
}))
vi.mock('@purescience/platform-ui/bridge/react/useAdjacentApp', () => ({ useAdjacentApp: vi.fn() }))
vi.mock('../lib/bindWhiteboardDocument', () => ({ bindWhiteboardDocument: vi.fn(async () => undefined) }))
vi.mock('../hooks/usePureWhiteboardAgentTools', () => ({ usePureWhiteboardAgentTools: vi.fn() }))
vi.mock('@purescience/platform-ui/editing/live/useLiveJson', () => ({ useLiveJson: () => ({ status: 'off', write: vi.fn() }) }))
vi.mock('../bridge/platformBridge', () => ({
  readTextFile: vi.fn(async (path: string) => { if (!mock.files.has(path)) throw new Error('ENOENT: no such file'); return mock.files.get(path)! }),
  writeTextFile: vi.fn(async (path: string, text: string) => { mock.files.set(path, text) }),
  writeBinaryFile: vi.fn(),
  updateWhiteboardSettings: mock.settings,
}))
vi.mock('@purescience/platform-ui/bridge/documents.mjs', () => ({
  onPlatformDocumentsChanged: () => () => {},
  createPlatformDraft: vi.fn(),
  autosavePlatformDocument: vi.fn(),
}))
vi.mock('@purescience/platform-ui/bridge/react/useDocumentLifecycle', () => ({ useDocumentLifecycle: () => ({ adopt: vi.fn() }) }))
vi.mock('@purescience/platform-bridge/components/AppFrame', () => ({
  AppFrame: ({ children, ...rest }: any) => {
    const { headerActions: _a, headerDocumentName: _b, ...attributes } = rest
    return <div data-testid="frame" {...attributes}>{children}</div>
  },
}))
vi.mock('@purescience/platform-ui/components/common/documents', () => ({ DocumentHeaderActions: () => null, DocumentSwitcher: () => null }))
vi.mock('@excalidraw/excalidraw', () => {
  const Wrapper = ({ children }: any) => children
  const Empty = () => null
  return {
    Excalidraw: ({ excalidrawAPI, initialData }: any) => {
      useEffect(() => {
        mock.mounts++
        excalidrawAPI({ getSceneElements: () => initialData.elements, getAppState: () => ({}), getFiles: () => ({}), updateScene: vi.fn(), scrollToContent: mock.scrollToContent })
      }, [])
      return <div>Canvas</div>
    },
    MainMenu: Object.assign(Wrapper, { DefaultItems: { ClearCanvas: Empty, ChangeCanvasBackground: Empty, Help: Empty }, Separator: Empty }),
    WelcomeScreen: Object.assign(Wrapper, { Center: Object.assign(Wrapper, { Heading: Wrapper }), Hints: { ToolbarHint: Empty } }),
    exportToBlob: vi.fn(),
    CaptureUpdateAction: { NEVER: 'NEVER' },
  }
})
import { WhiteboardWorkspace } from './WhiteboardWorkspace'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root, container: HTMLDivElement
const boot = { prefs: { workingDirectory: '/test' }, appSettings: { packagePath: '/test/board.whiteboard' } } as never
const noop = () => {}
const workspace = () => <WhiteboardWorkspace ready boot={boot} resource={null} onResourceHandled={noop} />
const held = { tabId: 'tab-2', name: 'the room', heldInRoom: true }
const frame = () => container.querySelector('[data-testid="frame"]')!

beforeEach(async () => {
  mock.mounts = 0
  mock.settings.mockClear()
  mock.scrollToContent.mockClear()
  mock.files.set('/test/board.whiteboard/whiteboard.whiteboard.json', JSON.stringify({ schemaVersion: 1, type: 'whiteboard.scene', elements: [{ id: 'one', type: 'rectangle', x: 0, y: 0 }], appState: {}, files: {}, updatedAt: 'now' }))
  vi.mocked(useAdjacentApp).mockReturnValue(held)
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root.render(workspace()))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) })
})
afterEach(async () => { await act(async () => root.unmount()) })

it('held in a page, the board has the box, fitted to it, and the status row is hidden but there', () => {
  expect(frame().hasAttribute('data-compact-room')).toBe(true)
  expect(container.textContent).toContain('Canvas')
  expect(mock.scrollToContent).toHaveBeenCalled()
  expect(container.querySelector('footer')?.getAttribute('data-compact')).toBe('hide')
})

it('a board opened here is not the one the full app reopens next time', () => {
  expect(mock.settings).not.toHaveBeenCalledWith(expect.objectContaining({ packagePath: expect.anything() }))
})

it('Full app gives the whole app back with the same canvas and no remount', async () => {
  vi.mocked(useAdjacentApp).mockReturnValue(null)
  await act(async () => root.render(workspace()))
  expect(frame().hasAttribute('data-compact-room')).toBe(false)
  expect(container.querySelector('[data-compact]')).toBeNull()
  expect(mock.mounts).toBe(1)
})
