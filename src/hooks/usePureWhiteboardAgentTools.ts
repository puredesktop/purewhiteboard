import { assertWhiteboardTarget } from '../lib/agentDocumentIdentity'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { runWhenCanvasReady } from '../lib/agentReadiness'
import { useRef } from 'react'
import {
  PUREWHITEBOARD_AGENT_LOG_LABEL,
  PUREWHITEBOARD_AGENT_TOOL_NAMES,
} from '../agents/catalog'
import type { WhiteboardAgentContext } from '../agents/context'
import {
  addShapeHandler,
  addTextHandler,
  clearWhiteboardHandler,
  connectHandler,
  exportImageHandler,
  getWhiteboardContextHandler,
  removeElementHandler,
  styleElementHandler,
} from '../agents/handlers'
import { WhiteboardToolError } from '../lib/whiteboardScene'

export function usePureWhiteboardAgentTools(
  ready: boolean,
  context: WhiteboardAgentContext,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const run = (
    action: (ctx: WhiteboardAgentContext) => Promise<{ content: string }>,
    save = false,
    needsCanvas = true,
    target?: { path: unknown },
  ) => {
    const next = queue.current
      .catch(() => undefined)
      .then(async () => {
        const ctx = needsCanvas
          ? await runWhenCanvasReady(() => contextRef.current)
          : contextRef.current
        if (target)
          assertWhiteboardTarget(target.path, ctx.document?.packagePath)
        const result = await action(ctx)
        if (save) {
          const path = await ctx.save()
          return {
            ...result,
            content: `${result.content}\nSaved whiteboard package: ${path}`,
          }
        }
        return result
      })
    queue.current = next
    return next
  }
  usePlatformAgentTools({
    ready,
    tools: PUREWHITEBOARD_AGENT_TOOL_NAMES,
    logLabel: PUREWHITEBOARD_AGENT_LOG_LABEL,
    errorType: WhiteboardToolError,
    handlers: {
      createWhiteboard: invoke =>
        run(
          async ctx => ({
            content: JSON.stringify({
              packagePath: await ctx.create(
                String(invoke.arguments.title ?? 'Untitled whiteboard'),
              ),
            }),
          }),
          false,
          false,
        ),
      openWhiteboard: invoke =>
        run(
          async ctx => ({
            content: JSON.stringify({
              packagePath: await ctx.open(String(invoke.arguments.path ?? '')),
            }),
          }),
          false,
          false,
        ),
      saveWhiteboard: invoke =>
        run(
          async ctx => ({
            content: JSON.stringify({ packagePath: await ctx.save() }),
          }),
          false,
          true,
          { path: invoke.arguments.packagePath },
        ),
      getWhiteboardContext: () => run(getWhiteboardContextHandler),
      addShape: invoke =>
        run(ctx => addShapeHandler(ctx, invoke), true, true, {
          path: invoke.arguments.packagePath,
        }),
      addText: invoke =>
        run(ctx => addTextHandler(ctx, invoke), true, true, {
          path: invoke.arguments.packagePath,
        }),
      connect: invoke =>
        run(ctx => connectHandler(ctx, invoke), true, true, {
          path: invoke.arguments.packagePath,
        }),
      styleElement: invoke =>
        run(ctx => styleElementHandler(ctx, invoke), true, true, {
          path: invoke.arguments.packagePath,
        }),
      removeElement: invoke =>
        run(ctx => removeElementHandler(ctx, invoke), true, true, {
          path: invoke.arguments.packagePath,
        }),
      clearWhiteboard: invoke =>
        run(ctx => clearWhiteboardHandler(ctx, invoke), true, true, {
          path: invoke.arguments.packagePath,
        }),
      exportImage: invoke =>
        run(ctx => exportImageHandler(ctx, invoke), false, true, {
          path: invoke.arguments.packagePath,
        }),
    },
  })
}
