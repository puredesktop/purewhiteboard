// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import type { WhiteboardAgentContext } from '../agents/context'
const mock = vi.hoisted(() => ({ handlers: {} as Record<string, AgentToolHandler>, mutate: vi.fn(async () => ({ content: 'added' })) }))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformAgentTools', () => ({ usePlatformAgentTools: (options: { handlers: Record<string, AgentToolHandler> }) => { mock.handlers = options.handlers } }))
vi.mock('../lib/whiteboardScene', () => ({ WhiteboardToolError: class extends Error {} }))
vi.mock('../agents/handlers', () => ({ addShapeHandler: mock.mutate, addTextHandler: mock.mutate, connectHandler: mock.mutate, styleElementHandler: mock.mutate, removeElementHandler: mock.mutate, clearWhiteboardHandler: mock.mutate, exportImageHandler: mock.mutate, getWhiteboardContextHandler: mock.mutate }))
import { usePureWhiteboardAgentTools } from './usePureWhiteboardAgentTools'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: ReturnType<typeof createRoot> | undefined
const invoke = (path = '/draft.whiteboard') => ({ toolCallId: 'test', shortName: 'addShape', arguments: { packagePath: path } })
async function mount(save: WhiteboardAgentContext['save']) {
  const context = { api: {}, document: { packagePath: '/draft.whiteboard' }, isReady: () => true, save } as WhiteboardAgentContext
  function Probe() { usePureWhiteboardAgentTools(true, context); return null }
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(<Probe />))
}
afterEach(async () => { await act(async () => root?.unmount()); mock.mutate.mockClear() })
it('rejects the wrong document before any mutation or save', async () => {
  const save = vi.fn(async () => '/draft.whiteboard')
  await mount(save)
  await expect(mock.handlers.addShape(invoke('/other.whiteboard'))).rejects.toThrow('whiteboard changed')
  expect(mock.mutate).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})
it('does not acknowledge a mutation or start the next one before saving', async () => {
  let release!: () => void
  const firstSave = new Promise<void>(resolve => { release = resolve })
  let count = 0
  await mount(async () => { if (++count === 1) await firstSave; return '/draft.whiteboard' })
  const first = mock.handlers.addShape(invoke())
  const second = mock.handlers.addShape(invoke())
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(mock.mutate).toHaveBeenCalledTimes(1)
  release()
  expect((await first).content).toContain('/draft.whiteboard')
  await second
  expect(mock.mutate).toHaveBeenCalledTimes(2)
})
it('surfaces save failure and permits a subsequent explicit retry', async () => {
  let count = 0
  await mount(async () => { if (++count === 1) throw new Error('disk full'); return '/draft.whiteboard' })
  await expect(mock.handlers.addShape(invoke())).rejects.toThrow('disk full')
  await expect(mock.handlers.saveWhiteboard(invoke())).resolves.toHaveProperty('content')
  expect(mock.mutate).toHaveBeenCalledTimes(1)
})
