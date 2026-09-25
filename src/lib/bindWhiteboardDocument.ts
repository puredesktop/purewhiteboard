import { updateCurrentWorkspaceTab } from '@purescience/platform-ui/bridge/workspace'

/** Persist the document in this viewport, not the shared last-board setting. */
export async function bindWhiteboardDocument(path: string): Promise<void> {
  const result = await updateCurrentWorkspaceTab({ resource: { path } })
  if (!result.updated)
    throw new Error(
      'The whiteboard is saved, but its tab binding could not be updated. Reopen the saved package before continuing.',
    )
}
