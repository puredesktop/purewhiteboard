import { expect, it, vi } from 'vitest'
import { updateCurrentWorkspaceTab } from '@purescience/platform-ui/bridge/workspace'
vi.mock('@purescience/platform-ui/bridge/workspace', () => ({
  updateCurrentWorkspaceTab: vi.fn(async () => ({ updated: true })),
}))
import { bindWhiteboardDocument } from './bindWhiteboardDocument'
it('persists the exact document resource through the existing public bridge', async () => {
  await bindWhiteboardDocument('/new.whiteboard')
  expect(updateCurrentWorkspaceTab).toHaveBeenCalledWith({
    resource: { path: '/new.whiteboard' },
  })
})
it('reports a failed tab binding instead of silently falling back to a shared default', async () => {
  vi.mocked(updateCurrentWorkspaceTab).mockResolvedValueOnce({ updated: false })
  await expect(bindWhiteboardDocument('/new.whiteboard')).rejects.toThrow(
    'tab binding',
  )
})
