import { addChatSplitDockviewSession } from './chat-split-dockview-registry'
import { directionFromDropPoint } from './chat-split-drop-quadrant'
import { useChatSplitWorkspaceStore } from './chat-split-workspace-store'

const CHAT_SURFACE_DRAG_EVENT = 'cradle:chat-surface-drag'

export interface ChatSurfaceDragDetail {
  clientX: number | null
  clientY: number | null
  sessionId: string | null
}

export function publishChatSurfaceDrag(detail: ChatSurfaceDragDetail): void {
  window.dispatchEvent(new CustomEvent<ChatSurfaceDragDetail>(CHAT_SURFACE_DRAG_EVENT, { detail }))
}

export function subscribeChatSurfaceDrag(
  listener: (detail: ChatSurfaceDragDetail) => void,
): () => void {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<ChatSurfaceDragDetail>).detail)
  }
  window.addEventListener(CHAT_SURFACE_DRAG_EVENT, handleEvent)
  return () => window.removeEventListener(CHAT_SURFACE_DRAG_EVENT, handleEvent)
}

export function dropChatSurfaceAtPoint(input: {
  clientX: number
  clientY: number
  sessionId: string
}): boolean {
  const target = document
    .elementFromPoint(input.clientX, input.clientY)
    ?.closest<HTMLElement>('[data-chat-split-drop-surface-id]')
  const surfaceId = target?.dataset.chatSplitDropSurfaceId
  const primarySessionId = target?.dataset.chatSplitPrimarySessionId
  if (!target || !surfaceId || !primarySessionId || primarySessionId === input.sessionId) {
    return false
  }

  const direction = directionFromDropPoint(target.getBoundingClientRect(), input)
  if (addChatSplitDockviewSession(surfaceId, input.sessionId, direction)) {
    return true
  }
  return useChatSplitWorkspaceStore.getState().addPane(surfaceId, input.sessionId, direction)
}
