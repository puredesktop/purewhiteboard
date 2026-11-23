import {
  createAppOperationsRegistry,
  defineAppTool,
  type AppAtomicToolDefinition,
  type BuildHandlersOptions,
} from '@purescience/platform-ui/bridge/appFunctions'
import type {
  AgentToolHandler,
  AgentToolHandlerResult,
  AgentToolInvokeContext,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { assertWhiteboardTarget } from '../lib/agentDocumentIdentity'
import { runWhenCanvasReady } from '../lib/agentReadiness'
import { WhiteboardToolError } from '../lib/whiteboardScene'
import { PUREWHITEBOARD_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import type { WhiteboardAgentContext } from './context'
import { PUREWHITEBOARD_FUNCTIONS } from './functions'
import {
  addShapeHandler,
  addTextHandler,
  clearWhiteboardHandler,
  connectHandler,
  exportImageHandler,
  getWhiteboardContextHandler,
  removeElementHandler,
  styleElementHandler,
} from './handlers'

type AtomicRunner = (
  ctx: WhiteboardAgentContext,
  args: Record<string, unknown>,
  invoke: AgentToolInvokeContext,
) => Promise<AgentToolHandlerResult>

async function runCanvasAction(
  ctx: WhiteboardAgentContext,
  args: Record<string, unknown>,
  action: (readyCtx: WhiteboardAgentContext) => Promise<AgentToolHandlerResult>,
  options: { save?: boolean; requireTarget?: boolean } = {},
): Promise<AgentToolHandlerResult> {
  const readyCtx = await runWhenCanvasReady(() => ctx)
  if (options.requireTarget) {
    assertWhiteboardTarget(args.packagePath, readyCtx.document?.packagePath)
  }
  const result = await action(readyCtx)
  if (options.save) {
    const path = await readyCtx.save()
    return {
      ...result,
      content: `${result.content}\nSaved whiteboard package: ${path}`,
    }
  }
  return result
}

const ATOMIC_RUNNERS: Record<string, AtomicRunner> = {
  createWhiteboard: async (ctx, args) => ({
    content: JSON.stringify({
      packagePath: await ctx.create(String(args.title ?? 'Untitled whiteboard')),
    }),
  }),
  openWhiteboard: async (ctx, args) => ({
    content: JSON.stringify({
      packagePath: await ctx.open(String(args.path ?? '')),
    }),
  }),
  saveWhiteboard: (ctx, args) =>
    runCanvasAction(
      ctx,
      args,
      async readyCtx => ({
        content: JSON.stringify({ packagePath: await readyCtx.save() }),
      }),
      { requireTarget: true },
    ),
  getWhiteboardContext: (ctx, args) =>
    runCanvasAction(ctx, args, readyCtx =>
      getWhiteboardContextHandler(readyCtx),
    ),
  addShape: (ctx, args, invoke) =>
    runCanvasAction(
      ctx,
      args,
      readyCtx => addShapeHandler(readyCtx, invoke),
      { save: true, requireTarget: true },
    ),
  addText: (ctx, args, invoke) =>
    runCanvasAction(
      ctx,
      args,
      readyCtx => addTextHandler(readyCtx, invoke),
      { save: true, requireTarget: true },
    ),
  connect: (ctx, args, invoke) =>
    runCanvasAction(
      ctx,
      args,
      readyCtx => connectHandler(readyCtx, invoke),
      { save: true, requireTarget: true },
    ),
  styleElement: (ctx, args, invoke) =>
    runCanvasAction(
      ctx,
      args,
      readyCtx => styleElementHandler(readyCtx, invoke),
      { save: true, requireTarget: true },
    ),
  removeElement: (ctx, args, invoke) =>
    runCanvasAction(
      ctx,
      args,
      readyCtx => removeElementHandler(readyCtx, invoke),
      { save: true, requireTarget: true },
    ),
  clearWhiteboard: (ctx, args, invoke) =>
    runCanvasAction(
      ctx,
      args,
      readyCtx => clearWhiteboardHandler(readyCtx, invoke),
      { save: true, requireTarget: true },
    ),
  exportImage: (ctx, args, invoke) =>
    runCanvasAction(
      ctx,
      args,
      readyCtx => exportImageHandler(readyCtx, invoke),
      { requireTarget: true },
    ),
}

const atomicTools: AppAtomicToolDefinition<WhiteboardAgentContext>[] =
  PUREWHITEBOARD_ATOMIC_TOOL_SCHEMAS.map(schema =>
    defineAppTool<WhiteboardAgentContext>({
      ...schema,
      run: async (ctx, args, invoke) => {
        const runner = ATOMIC_RUNNERS[schema.name]
        if (!runner) {
          throw new WhiteboardToolError(
            `Missing atomic tool handler for "${schema.name}".`,
          )
        }
        return runner(ctx, args, invoke)
      },
    }),
  )

/**
 * PureWhiteboard's unified Operations Registry built on `@purescience/platform-ui/bridge/appFunctions`:
 *   - 4 composite `function` workflows (`fn_*`, always exposed)
 *   - 3 core atomic tools (~27% of 11, always exposed)
 *   - 3 universal escape-hatch meta-tools (always exposed)
 *   - 8 extended specialist atomic tools (hidden by default, 100% reachable on demand)
 */
export const PUREWHITEBOARD_OPERATIONS_REGISTRY =
  createAppOperationsRegistry<WhiteboardAgentContext>({
    appSlug: 'whiteboard',
    appName: 'PureWhiteboard',
    functions: PUREWHITEBOARD_FUNCTIONS,
    tools: atomicTools,
  })

export function buildPureWhiteboardHandlers(
  getCtx: () => WhiteboardAgentContext,
  options: BuildHandlersOptions<WhiteboardAgentContext> = {},
): Record<string, AgentToolHandler> {
  return PUREWHITEBOARD_OPERATIONS_REGISTRY.buildHandlers(getCtx, {
    createError: message => new WhiteboardToolError(message),
    ...options,
  })
}
