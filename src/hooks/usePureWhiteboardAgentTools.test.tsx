// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import type { WhiteboardAgentContext } from '../agents/context'

const mock = vi.hoisted(() => ({
  handlers: {} as Record<string, AgentToolHandler>,
  mutate: vi.fn(async () => ({ content: 'added' })),
}))

vi.mock('@purescience/platform-ui/bridge/react/usePlatformAgentTools', () => ({
  usePlatformAgentTools: (options: {
    handlers: Record<string, AgentToolHandler>
  }) => {
    mock.handlers = options.handlers
  },
}))
vi.mock('../lib/whiteboardScene', () => ({
  SHAPES: ['rectangle', 'ellipse', 'diamond'],
  BINDABLE_TYPES: new Set(['rectangle', 'ellipse', 'diamond', 'text', 'image']),
  WhiteboardToolError: class extends Error {},
  liveElements: () => [],
  touched: (el: unknown) => el,
  commit: () => undefined,
  createdElements: () => [],
  getWhiteboardContext: () => ({
    elementCount: 0,
    selectedElementIds: [],
    truncated: false,
    elements: [],
  }),
  nextFreePosition: () => ({ x: 120, y: 120 }),
}))
vi.mock('../agents/handlers', () => ({
  addShapeHandler: mock.mutate,
  addTextHandler: mock.mutate,
  connectHandler: mock.mutate,
  styleElementHandler: mock.mutate,
  removeElementHandler: mock.mutate,
  clearWhiteboardHandler: mock.mutate,
  exportImageHandler: mock.mutate,
  getWhiteboardContextHandler: mock.mutate,
}))

import { usePureWhiteboardAgentTools } from './usePureWhiteboardAgentTools'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let root: ReturnType<typeof createRoot> | undefined

const invokeExtended = (
  tool: string,
  path = '/draft.whiteboard',
  extra: Record<string, unknown> = {},
) => ({
  toolCallId: 'test',
  shortName: 'callExtendedTool',
  arguments: {
    tool,
    arguments: { packagePath: path, ...extra },
  },
})

async function mount(save: WhiteboardAgentContext['save']) {
  const context = {
    api: { getSceneElements: () => [], updateScene: () => undefined },
    document: { packagePath: '/draft.whiteboard' },
    isReady: () => true,
    save,
  } as unknown as WhiteboardAgentContext
  function Probe() {
    usePureWhiteboardAgentTools(true, context)
    return null
  }
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(<Probe />))
}

afterEach(async () => {
  await act(async () => root?.unmount())
  mock.mutate.mockClear()
})

it('rejects the wrong document before any mutation or save (both direct function and extended tool)', async () => {
  const save = vi.fn(async () => '/draft.whiteboard')
  await mount(save)

  await expect(
    mock.handlers.callExtendedTool(
      invokeExtended('addShape', '/other.whiteboard', { shape: 'rectangle' }),
    ),
  ).rejects.toThrow('whiteboard changed')

  await expect(
    mock.handlers.fn_buildDiagram({
      toolCallId: 'test-fn',
      shortName: 'fn_buildDiagram',
      arguments: {
        packagePath: '/other.whiteboard',
        nodes: [{ key: 'a', label: 'A' }],
      },
    }),
  ).rejects.toThrow('whiteboard changed')

  expect(mock.mutate).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})

it('does not acknowledge a mutation or start the next one before saving', async () => {
  let release!: () => void
  const firstSave = new Promise<void>(resolve => {
    release = resolve
  })
  let count = 0
  await mount(async () => {
    if (++count === 1) await firstSave
    return '/draft.whiteboard'
  })
  const first = mock.handlers.callExtendedTool(
    invokeExtended('addShape', '/draft.whiteboard', { shape: 'rectangle' }),
  )
  const second = mock.handlers.callExtendedTool(
    invokeExtended('addShape', '/draft.whiteboard', { shape: 'ellipse' }),
  )
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(mock.mutate).toHaveBeenCalledTimes(1)
  release()
  expect((await first).content).toContain('/draft.whiteboard')
  await second
  expect(mock.mutate).toHaveBeenCalledTimes(2)
})

it('surfaces save failure and permits a subsequent explicit retry', async () => {
  let count = 0
  await mount(async () => {
    if (++count === 1) throw new Error('disk full')
    return '/draft.whiteboard'
  })
  await expect(
    mock.handlers.callExtendedTool(
      invokeExtended('addShape', '/draft.whiteboard', { shape: 'rectangle' }),
    ),
  ).rejects.toThrow('disk full')
  await expect(
    mock.handlers.callExtendedTool(
      invokeExtended('saveWhiteboard', '/draft.whiteboard'),
    ),
  ).resolves.toHaveProperty('content')
  expect(mock.mutate).toHaveBeenCalledTimes(1)
})
