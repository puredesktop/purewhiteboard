import type { WhiteboardApiLike } from '../lib/whiteboardScene'

/**
 * What tool handlers see, re-assigned every render and read through a ref:
 * the live Excalidraw API and the workspace's own export path, so a drawer
 * export and the header button are the same code.
 */
export interface WhiteboardAgentContext {
  isReady: () => boolean
  api: WhiteboardApiLike | null
  document: {
    packagePath: string
    scenePath: string
    persisted: boolean
  } | null
  save: () => Promise<string>
  create: (title: string) => Promise<string>
  open: (path: string) => Promise<string>
  exportPng: (filename?: string) => Promise<string>
}
