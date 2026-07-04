import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ChatSessionRouteContent } from '~/features/chat/session/chat-session-route-content'
import { chatSurfaceId } from '~/navigation/surface-identity'

import { ChatSplitDockview } from './chat-split-dockview'
import { ChatSplitFlatDropZone } from './chat-split-flat-drop-zone'
import { useChatSplitWorkspaceStore } from './chat-split-workspace-store'

/**
 * VSCode-style split view host for a chat surface (top-level tab). Renders
 * the plain single-pane chat view until a session is dropped onto it from
 * the sidebar, at which point it mounts a `dockview` instance so multiple
 * sessions can be viewed side-by-side within the same tab.
 *
 * `sessionId` is always the *primary* pane — the one bound to this surface's
 * `/chat/$sessionId` route. It can gain sibling panes but is never itself
 * removable from the workspace (closing it means closing the tab).
 */
export function ChatSplitWorkspace({ sessionId }: { sessionId: string }) {
  const surfaceId = chatSurfaceId(sessionId)
  const ensureWorkspace = useChatSplitWorkspaceStore(state => state.ensureWorkspace)

  useEffect(() => {
    ensureWorkspace(surfaceId, sessionId)
  }, [ensureWorkspace, surfaceId, sessionId])

  const paneSessionIds = useChatSplitWorkspaceStore(
    useShallow(state => state.workspaces[surfaceId]?.paneSessionIds ?? [sessionId]),
  )

  if (paneSessionIds.length <= 1) {
    return (
      <ChatSplitFlatDropZone surfaceId={surfaceId} primarySessionId={sessionId}>
        <ChatSessionRouteContent sessionId={sessionId} />
      </ChatSplitFlatDropZone>
    )
  }

  return (
    <ChatSplitDockview
      key={surfaceId}
      surfaceId={surfaceId}
      primarySessionId={sessionId}
      paneSessionIds={paneSessionIds}
    />
  )
}
