import { getChatSplitDockviewApi } from './chat-split-dockview-registry'
import { readChatSplitWorkspace } from './chat-split-workspace-store'

/**
 * Closes the currently focused *non-primary* pane of a chat surface's split
 * workspace, mirroring VSCode's Cmd+W (close the focused editor group before
 * falling back to closing the whole window). Returns `false` when there is
 * nothing to do at the split-view level — the caller should then fall back to
 * closing the surface (tab) itself, which also covers the single-pane and
 * "focused pane is primary" cases.
 */
export function closeFocusedChatSplitPane(surfaceId: string): boolean {
  const workspace = readChatSplitWorkspace(surfaceId)
  if (!workspace || workspace.paneSessionIds.length <= 1) {
    return false
  }
  if (workspace.focusedSessionId === workspace.primarySessionId) {
    return false
  }

  const api = getChatSplitDockviewApi(surfaceId)
  const panel = api?.getPanel(workspace.focusedSessionId)
  if (!api || !panel) {
    return false
  }

  api.removePanel(panel)
  return true
}
