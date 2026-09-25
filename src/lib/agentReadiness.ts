import type { WhiteboardAgentContext } from '../agents/context'

/** Tool registration may precede Excalidraw mounting on a cold app start. */
export async function runWhenCanvasReady(
  current: () => WhiteboardAgentContext,
  timeoutMs = 15000,
): Promise<WhiteboardAgentContext> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    const context = current()
    if (context.isReady() && context.api && context.document) return context
    if (Date.now() >= deadline)
      throw new Error(
        'Whiteboard did not finish loading. Reopen the document before retrying.',
      )
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
