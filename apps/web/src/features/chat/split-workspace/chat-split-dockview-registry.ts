import type { DockviewApi } from 'dockview-react'

/**
 * Transient (non-persisted) registry of live `DockviewApi` instances keyed by
 * surface id. Lets code outside the `dockview` component tree — e.g. the
 * global Cmd+W handler — command a specific split workspace without piping
 * the api instance through props.
 */
const registry = new Map<string, DockviewApi>()

export function registerChatSplitDockviewApi(surfaceId: string, api: DockviewApi): () => void {
  registry.set(surfaceId, api)
  return () => {
    if (registry.get(surfaceId) === api) {
      registry.delete(surfaceId)
    }
  }
}

export function getChatSplitDockviewApi(surfaceId: string): DockviewApi | undefined {
  return registry.get(surfaceId)
}
