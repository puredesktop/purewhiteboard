/** Keep in sync with `plugin.json` -> `app.agents.tools[].name`. */
export const PUREWHITEBOARD_AGENT_TOOL_NAMES = [
  'createWhiteboard',
  'openWhiteboard',
  'saveWhiteboard',
  'getWhiteboardContext',
  'addShape',
  'addText',
  'connect',
  'styleElement',
  'removeElement',
  'clearWhiteboard',
  'exportImage',
] as const

export const PUREWHITEBOARD_AGENT_LOG_LABEL = 'purewhiteboard'
