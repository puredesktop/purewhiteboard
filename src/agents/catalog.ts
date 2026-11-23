/**
 * Exposed PureWhiteboard operations (must stay in sync 1:1 with `plugin.json` -> `app.agents.tools[].name`).
 *
 * 3-tier exposure (built on `@purescience/platform-ui/bridge/appFunctions`):
 *   1. 4 composite `function` workflows (`fn_*`) — replace 3–20 atomic round-trips each
 *   2. 3 core atomic tools (~27% of 11) — indispensable context, board creation, and PNG export verbs
 *   3. 3 universal escape-hatch meta-tools (`discoverAppTools`, `callExtendedReadTool`, `callExtendedTool`)
 *      providing full on-demand access to the remaining 8 specialist atomic tools.
 */
export const PUREWHITEBOARD_FUNCTION_NAMES = [
  'fn_analyzeBoard',
  'fn_buildDiagram',
  'fn_createStickyBoard',
  'fn_refineBoard',
] as const

export const PUREWHITEBOARD_CORE_TOOL_NAMES = [
  'getWhiteboardContext',
  'createWhiteboard',
  'exportImage',
] as const

export const PUREWHITEBOARD_META_TOOL_NAMES = [
  'discoverAppTools',
  'callExtendedReadTool',
  'callExtendedTool',
] as const

export const EXPOSED_TOOL_NAMES = [
  ...PUREWHITEBOARD_FUNCTION_NAMES,
  ...PUREWHITEBOARD_CORE_TOOL_NAMES,
  ...PUREWHITEBOARD_META_TOOL_NAMES,
] as const

/** Keep in sync with `plugin.json` -> `app.agents.tools[].name`. */
export const PUREWHITEBOARD_AGENT_TOOL_NAMES = EXPOSED_TOOL_NAMES

export const PUREWHITEBOARD_EXTENDED_TOOL_NAMES = [
  'openWhiteboard',
  'saveWhiteboard',
  'addShape',
  'addText',
  'connect',
  'styleElement',
  'removeElement',
  'clearWhiteboard',
] as const

export const PUREWHITEBOARD_ALL_ATOMIC_TOOL_NAMES = [
  ...PUREWHITEBOARD_CORE_TOOL_NAMES,
  ...PUREWHITEBOARD_EXTENDED_TOOL_NAMES,
] as const

export const PUREWHITEBOARD_AGENT_LOG_LABEL = 'purewhiteboard'
