import { textOverlaps } from '../../lib/textOverlaps'
import { formatAgentToolJson } from '@purescience/platform-ui/bridge/agentToolHelpers'
import type {
  AgentToolHandlerResult,
  AgentToolInvokeContext,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import type { WhiteboardAgentContext } from '../context'
import {
  addWhiteboardShape,
  addWhiteboardText,
  clearWhiteboard,
  connectWhiteboardElements,
  getWhiteboardContext,
  removeWhiteboardElement,
  styleWhiteboardElement,
} from '../../lib/whiteboardScene'

function ensureApi(context: WhiteboardAgentContext) {
  if (!context.api) {
    throw new Error('Whiteboard canvas is not ready yet.')
  }
  return context.api
}

function ok(content: string): AgentToolHandlerResult {
  return { content }
}

export async function getWhiteboardContextHandler(
  context: WhiteboardAgentContext,
): Promise<AgentToolHandlerResult> {
  return ok(
    formatAgentToolJson({
      ...getWhiteboardContext(ensureApi(context)),
      document: context.document,
      textOverlaps: textOverlaps(ensureApi(context).getSceneElements()),
    }),
  )
}

export async function addShapeHandler(
  context: WhiteboardAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const element = addWhiteboardShape(ensureApi(context), invoke.arguments)
  return ok(
    `Added ${element.type} "${element.id}" at (${Math.round(
      element.x,
    )}, ${Math.round(element.y)}).`,
  )
}

export async function addTextHandler(
  context: WhiteboardAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const element = addWhiteboardText(ensureApi(context), invoke.arguments)
  return ok(
    `Added text "${element.id}" at (${Math.round(element.x)}, ${Math.round(
      element.y,
    )}).`,
  )
}

export async function connectHandler(
  context: WhiteboardAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const element = connectWhiteboardElements(
    ensureApi(context),
    invoke.arguments,
  )
  return ok(`Connected elements with arrow "${element.id}".`)
}

export async function styleElementHandler(
  context: WhiteboardAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const element = styleWhiteboardElement(ensureApi(context), invoke.arguments)
  return ok(`Restyled ${element.type} "${element.id}".`)
}

export async function removeElementHandler(
  context: WhiteboardAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const removed = removeWhiteboardElement(ensureApi(context), invoke.arguments)
  return ok(
    removed.length > 1
      ? `Removed element "${removed[0]}" and its label.`
      : `Removed element "${removed[0]}".`,
  )
}

export async function clearWhiteboardHandler(
  context: WhiteboardAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const count = clearWhiteboard(ensureApi(context), invoke.arguments)
  return ok(
    count
      ? `Cleared the whiteboard (${count} element${
          count === 1 ? '' : 's'
        } removed; ⌘Z in the canvas restores them).`
      : 'The whiteboard is already empty.',
  )
}

export async function exportImageHandler(
  context: WhiteboardAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const overlaps = textOverlaps(ensureApi(context).getSceneElements())
  if (overlaps.length) throw new Error(`Text labels overlap: ${JSON.stringify(overlaps)}. Reposition or wrap these labels and check the context again before exporting.`)
  const path = await context.exportPng(
    typeof invoke.arguments.filename === 'string'
      ? invoke.arguments.filename
      : undefined,
  )
  return ok(`Saved whiteboard PNG to ${path}`)
}
