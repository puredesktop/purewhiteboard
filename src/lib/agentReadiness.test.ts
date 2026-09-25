import { afterEach, expect, it, vi } from 'vitest'
import { runWhenCanvasReady } from './agentReadiness'
import type { WhiteboardAgentContext } from '../agents/context'
afterEach(() => vi.useRealTimers())
it('waits through cold startup and a document switch instead of using the outgoing canvas', async () => {
  vi.useFakeTimers()
  let ready = false
  let context = {
    api: {},
    document: { packagePath: '/old.whiteboard' },
    isReady: () => ready,
  } as WhiteboardAgentContext
  const result = runWhenCanvasReady(() => context)
  await vi.advanceTimersByTimeAsync(100)
  context = {
    ...context,
    document: {
      packagePath: '/new.whiteboard',
      scenePath: '/new.whiteboard/whiteboard.whiteboard.json',
      persisted: true,
    },
  }
  ready = true
  await vi.advanceTimersByTimeAsync(50)
  expect((await result).document?.packagePath).toBe('/new.whiteboard')
})
it('bounds a canvas that never becomes ready', async () => {
  vi.useFakeTimers()
  const result = runWhenCanvasReady(
    () => ({ api: null, isReady: () => false } as WhiteboardAgentContext),
    100,
  )
  const assertion = expect(result).rejects.toThrow('did not finish loading')
  await vi.advanceTimersByTimeAsync(100)
  await assertion
})
