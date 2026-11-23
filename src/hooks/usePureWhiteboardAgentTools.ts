import {
  usePlatformAgentTools,
  type AgentToolHandler,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { useMemo, useRef } from 'react'
import {
  EXPOSED_TOOL_NAMES,
  PUREWHITEBOARD_AGENT_LOG_LABEL,
} from '../agents/catalog'
import type { WhiteboardAgentContext } from '../agents/context'
import { buildPureWhiteboardHandlers } from '../agents/operationsRegistry'
import { WhiteboardToolError } from '../lib/whiteboardScene'

export function usePureWhiteboardAgentTools(
  ready: boolean,
  context: WhiteboardAgentContext,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  // Live getter facade so runWhenCanvasReady always observes re-rendered state.
  const liveContextRef = useRef<WhiteboardAgentContext | null>(null)
  if (!liveContextRef.current) {
    liveContextRef.current = {
      get isReady() {
        return contextRef.current.isReady
      },
      get api() {
        return contextRef.current.api
      },
      get document() {
        return contextRef.current.document
      },
      get save() {
        return contextRef.current.save
      },
      get create() {
        return contextRef.current.create
      },
      get open() {
        return contextRef.current.open
      },
      get exportPng() {
        return contextRef.current.exportPng
      },
    }
  }

  const registryHandlersRef = useRef<Record<string, AgentToolHandler> | null>(
    null,
  )
  if (!registryHandlersRef.current) {
    registryHandlersRef.current = buildPureWhiteboardHandlers(
      () => liveContextRef.current!,
    )
  }

  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const exposedHandlers = useMemo(
    () =>
      Object.fromEntries(
        EXPOSED_TOOL_NAMES.map(name => [
          name,
          async (invoke: Parameters<AgentToolHandler>[0]) => {
            const next = queue.current
              .catch(() => undefined)
              .then(() => registryHandlersRef.current![name]!(invoke))
            queue.current = next
            return next
          },
        ]),
      ),
    [],
  )

  usePlatformAgentTools({
    ready,
    tools: EXPOSED_TOOL_NAMES,
    logLabel: PUREWHITEBOARD_AGENT_LOG_LABEL,
    errorType: WhiteboardToolError,
    handlers: exposedHandlers,
  })
}
