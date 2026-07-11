import type { SerializedDockview } from 'dockview-react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { useSurfaceStore } from '~/navigation/surface-store'
import { persistStorage } from '~/store/persist-storage'

/**
 * Mirrors dockview's `Direction` type structurally without importing dockview
 * into this store, so the split-workspace *state* stays decoupled from the
 * dockview *rendering* layer that consumes it.
 */
export type ChatSplitDirection = 'left' | 'right' | 'above' | 'below'

/**
 * VSCode-style split view state for a single chat surface. `primarySessionId`
 * is the session bound to the surface's route (`/chat/$sessionId`) — it is
 * always present and can never be removed, since closing it means closing the
 * surface itself. Additional entries in `paneSessionIds` are sessions dragged
 * in from the sidebar to split the surface into multiple simultaneously
 * visible panes.
 */
export interface ChatSplitPaneWorkspace {
  primarySessionId: string
  paneSessionIds: string[]
  focusedSessionId: string
  /** Raw dockview layout, only meaningful once split into 2+ panes. */
  layout: SerializedDockview | null
  /**
   * Set when a pane is added while the workspace is still flat (dockview not
   * yet mounted) — carries the drop quadrant so the dockview container can
   * place the very first split correctly once it mounts. Consumed once.
   */
  pendingSplit: { sessionId: string, direction: ChatSplitDirection } | null
}

interface ChatSplitWorkspaceState {
  workspaces: Record<string, ChatSplitPaneWorkspace>
  ensureWorkspace: (surfaceId: string, primarySessionId: string) => void
  addPane: (surfaceId: string, sessionId: string, direction?: ChatSplitDirection) => boolean
  removePane: (surfaceId: string, sessionId: string) => void
  setFocusedSession: (surfaceId: string, sessionId: string) => void
  setLayout: (surfaceId: string, layout: SerializedDockview | null) => void
  consumePendingSplit: (surfaceId: string) => ChatSplitPaneWorkspace['pendingSplit']
  pruneWorkspace: (surfaceId: string) => void
}

const STORAGE_KEY = 'cradle:chat-split-workspaces:v1'

export const useChatSplitWorkspaceStore = create<ChatSplitWorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: {},

      ensureWorkspace: (surfaceId, primarySessionId) =>
        set((state) => {
          if (state.workspaces[surfaceId]) {
            return state
          }
          return {
            workspaces: {
              ...state.workspaces,
              [surfaceId]: {
                primarySessionId,
                paneSessionIds: [primarySessionId],
                focusedSessionId: primarySessionId,
                layout: null,
                pendingSplit: null,
              },
            },
          }
        }),

      addPane: (surfaceId, sessionId, direction) => {
        let added = false
        set((state) => {
          const existing = state.workspaces[surfaceId]
          if (!existing || existing.paneSessionIds.includes(sessionId)) {
            return state
          }
          added = true
          const wasFlat = existing.paneSessionIds.length <= 1
          return {
            workspaces: {
              ...state.workspaces,
              [surfaceId]: {
                ...existing,
                paneSessionIds: [...existing.paneSessionIds, sessionId],
                focusedSessionId: sessionId,
                pendingSplit: wasFlat && direction ? { sessionId, direction } : existing.pendingSplit,
              },
            },
          }
        })
        return added
      },

      removePane: (surfaceId, sessionId) =>
        set((state) => {
          const existing = state.workspaces[surfaceId]
          if (!existing || sessionId === existing.primarySessionId || !existing.paneSessionIds.includes(sessionId)) {
            return state
          }
          const paneSessionIds = existing.paneSessionIds.filter(id => id !== sessionId)
          const focusedSessionId
            = existing.focusedSessionId === sessionId ? existing.primarySessionId : existing.focusedSessionId
          return {
            workspaces: {
              ...state.workspaces,
              [surfaceId]: {
                ...existing,
                paneSessionIds,
                focusedSessionId,
                layout: paneSessionIds.length <= 1 ? null : existing.layout,
              },
            },
          }
        }),

      setFocusedSession: (surfaceId, sessionId) =>
        set((state) => {
          const existing = state.workspaces[surfaceId]
          if (!existing || existing.focusedSessionId === sessionId || !existing.paneSessionIds.includes(sessionId)) {
            return state
          }
          return {
            workspaces: {
              ...state.workspaces,
              [surfaceId]: { ...existing, focusedSessionId: sessionId },
            },
          }
        }),

      setLayout: (surfaceId, layout) =>
        set((state) => {
          const existing = state.workspaces[surfaceId]
          if (!existing) {
            return state
          }
          return {
            workspaces: {
              ...state.workspaces,
              [surfaceId]: { ...existing, layout },
            },
          }
        }),

      consumePendingSplit: (surfaceId) => {
        const existing = get().workspaces[surfaceId]
        const pendingSplit = existing?.pendingSplit ?? null
        if (pendingSplit) {
          set((state) => {
            const current = state.workspaces[surfaceId]
            if (!current) {
              return state
            }
            return {
              workspaces: {
                ...state.workspaces,
                [surfaceId]: { ...current, pendingSplit: null },
              },
            }
          })
        }
        return pendingSplit
      },

      pruneWorkspace: surfaceId =>
        set((state) => {
          if (!(surfaceId in state.workspaces)) {
            return state
          }
          const { [surfaceId]: _removed, ...rest } = state.workspaces
          return { workspaces: rest }
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: persistStorage,
      partialize: state => ({ workspaces: state.workspaces }),
    },
  ),
)

/** Garbage-collect split-workspace state once its owning surface (tab) closes. */
useSurfaceStore.subscribe((state) => {
  const validSurfaceIds = new Set(state.surfaces.map(surface => surface.id))
  const { workspaces, pruneWorkspace } = useChatSplitWorkspaceStore.getState()
  for (const surfaceId of Object.keys(workspaces)) {
    if (!validSurfaceIds.has(surfaceId)) {
      pruneWorkspace(surfaceId)
    }
  }
})

export function readChatSplitWorkspace(surfaceId: string): ChatSplitPaneWorkspace | undefined {
  return useChatSplitWorkspaceStore.getState().workspaces[surfaceId]
}

export function useChatSplitFocusedSessionId(surfaceId: string | null): string | null {
  return useChatSplitWorkspaceStore((state) => {
    if (!surfaceId) {
      return null
    }
    const workspace = state.workspaces[surfaceId]
    return workspace && workspace.paneSessionIds.length > 1 ? workspace.focusedSessionId : null
  })
}
