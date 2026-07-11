import type { DockviewApi } from 'dockview-react'

import type { ChatSplitDirection } from './chat-split-workspace-store'

/**
 * Transient (non-persisted) registry of live `DockviewApi` instances keyed by
 * surface id. Lets code outside the `dockview` component tree — e.g. the
 * global Cmd+W handler — command a specific split workspace without piping
 * the api instance through props.
 */
interface ChatSplitDockviewRegistration {
  api: DockviewApi
  addSession: (sessionId: string, direction: ChatSplitDirection) => boolean
}

const registry = new Map<string, ChatSplitDockviewRegistration>()

export function registerChatSplitDockviewApi(
  surfaceId: string,
  registration: ChatSplitDockviewRegistration,
): () => void {
  registry.set(surfaceId, registration)
  return () => {
    if (registry.get(surfaceId) === registration) {
      registry.delete(surfaceId)
    }
  }
}

export function getChatSplitDockviewApi(surfaceId: string): DockviewApi | undefined {
  return registry.get(surfaceId)?.api
}

export function addChatSplitDockviewSession(
  surfaceId: string,
  sessionId: string,
  direction: ChatSplitDirection,
): boolean {
  return registry.get(surfaceId)?.addSession(sessionId, direction) ?? false
}
