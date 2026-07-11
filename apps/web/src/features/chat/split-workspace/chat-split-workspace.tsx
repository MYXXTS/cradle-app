import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ChatSessionRouteContent } from '~/features/chat/session/chat-session-route-content'
import { chatSurfaceId } from '~/navigation/surface-identity'

import { ChatSplitDockview } from './chat-split-dockview'
import type { FlatSplitDirection } from './chat-split-drop-quadrant'
import { directionFromDropPoint } from './chat-split-drop-quadrant'
import { ChatSplitDropIndicator, ChatSplitFlatDropZone } from './chat-split-flat-drop-zone'
import { subscribeChatSurfaceDrag } from './chat-split-surface-drop'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [surfaceDropDirection, setSurfaceDropDirection] = useState<FlatSplitDirection | null>(null)
  const surfaceId = chatSurfaceId(sessionId)
  const ensureWorkspace = useChatSplitWorkspaceStore(state => state.ensureWorkspace)

  useEffect(() => {
    ensureWorkspace(surfaceId, sessionId)
  }, [ensureWorkspace, surfaceId, sessionId])

  useEffect(() => subscribeChatSurfaceDrag((detail) => {
    const container = containerRef.current
    if (!container || detail.sessionId === null || detail.sessionId === sessionId || detail.clientX === null || detail.clientY === null) {
      setSurfaceDropDirection(null)
      return
    }
    const target = document.elementFromPoint(detail.clientX, detail.clientY)
    if (!target || !container.contains(target)) {
      setSurfaceDropDirection(null)
      return
    }
    setSurfaceDropDirection(directionFromDropPoint(container.getBoundingClientRect(), {
      clientX: detail.clientX,
      clientY: detail.clientY,
    }))
  }), [sessionId])

  const paneSessionIds = useChatSplitWorkspaceStore(
    useShallow(state => state.workspaces[surfaceId]?.paneSessionIds ?? [sessionId]),
  )

  const content = paneSessionIds.length <= 1
    ? (
      <ChatSplitFlatDropZone surfaceId={surfaceId} primarySessionId={sessionId}>
        <ChatSessionRouteContent sessionId={sessionId} />
      </ChatSplitFlatDropZone>
    )
    : (
        <ChatSplitDockview
          key={surfaceId}
          surfaceId={surfaceId}
          primarySessionId={sessionId}
          paneSessionIds={paneSessionIds}
        />
      )

  return (
    <div
      ref={containerRef}
      data-chat-split-drop-surface-id={surfaceId}
      data-chat-split-primary-session-id={sessionId}
      className="relative h-full min-h-0 w-full min-w-0"
    >
      {content}
      {surfaceDropDirection && <ChatSplitDropIndicator direction={surfaceDropDirection} />}
    </div>
  )
}
