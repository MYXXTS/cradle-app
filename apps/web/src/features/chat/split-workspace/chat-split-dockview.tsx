import type {
  DockviewApi,
  DockviewDidDropEvent,
  DockviewDndOverlayEvent,
  DockviewPanelApi,
  DockviewReadyEvent,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
  SerializedDockview,
} from 'dockview-react'
import { DockviewDefaultTab, DockviewReact, positionToDirection } from 'dockview-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CHAT_SESSION_FALLBACK_LABEL } from '~/features/chat/session/chat-session-label'
import { ChatSessionRouteContent } from '~/features/chat/session/chat-session-route-content'
import { readDraggedSessionId, SESSION_DRAG_MIME_TYPE } from '~/features/workspace/session-drag-data'
import { cn } from '~/lib/utils'
import { SurfaceActivityProvider } from '~/navigation/surface-activity-context'

import { registerChatSplitDockviewApi } from './chat-split-dockview-registry'
import { useChatSplitWorkspaceStore } from './chat-split-workspace-store'
import { themeCradle } from './dockview-theme-cradle'

interface ChatSplitPanelParams {
  sessionId: string
  isPrimary: boolean
}

/**
 * `panelApi.isActive` means "selected tab of the *globally focused* group" —
 * with a left/right split, only the focused side ever reports `true`, which
 * is wrong for "should this pane render as on-screen". `isVisible` instead
 * tracks whether the panel is the shown tab of its *own* group, which is
 * `true` for every simultaneously on-screen pane regardless of which group
 * currently holds focus.
 */
function useDockviewPanelVisible(api: DockviewPanelApi): boolean {
  const [visible, setVisible] = useState(api.isVisible)

  useEffect(() => {
    setVisible(api.isVisible)
    return api.onDidVisibilityChange(event => setVisible(event.isVisible)).dispose
  }, [api])

  return visible
}

/**
 * `isGroupActive` tracks whether *this panel's group* is the one holding
 * dockview-wide focus — used purely for the visual "dim the unfocused split"
 * treatment, independent from `isVisible` which drives actual mount/connect
 * behaviour above.
 */
function useDockviewPanelGroupActive(api: DockviewPanelApi): boolean {
  const [groupActive, setGroupActive] = useState(api.isGroupActive)

  useEffect(() => {
    setGroupActive(api.isGroupActive)
    return api.onDidActiveGroupChange(event => setGroupActive(event.isActive)).dispose
  }, [api])

  return groupActive
}

function ChatSplitPanelTab(props: IDockviewPanelHeaderProps<ChatSplitPanelParams>) {
  return <DockviewDefaultTab {...props} hideClose={props.params.isPrimary} />
}

function ChatSplitPanelContent({ api, params }: IDockviewPanelProps<ChatSplitPanelParams>) {
  const isVisible = useDockviewPanelVisible(api)
  const isGroupActive = useDockviewPanelGroupActive(api)
  const handleTitleChange = useCallback((title: string) => api.setTitle(title), [api])

  return (
    <SurfaceActivityProvider active={isVisible}>
      <div
        className={cn(
          'h-full w-full transition-opacity duration-[var(--duration-quick)] ease-[var(--ease-standard)]',
          !isGroupActive && 'opacity-80',
        )}
      >
        <ChatSessionRouteContent sessionId={params.sessionId} onTitleChange={handleTitleChange} />
      </div>
    </SurfaceActivityProvider>
  )
}

const dockviewComponents = { chatSession: ChatSplitPanelContent }
const dockviewTabComponents = { chatSession: ChatSplitPanelTab }

function isSessionDragOverlayEvent(event: DockviewDndOverlayEvent): boolean {
  return event.nativeEvent instanceof DragEvent && isSessionDragOverlayDataTransfer(event.nativeEvent.dataTransfer)
}

function isSessionDragOverlayDataTransfer(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes(SESSION_DRAG_MIME_TYPE)
}

function panelParamsFor(sessionId: string, primarySessionId: string): ChatSplitPanelParams {
  return { sessionId, isPrimary: sessionId === primarySessionId }
}

export function ChatSplitDockview({
  surfaceId,
  primarySessionId,
  paneSessionIds,
}: {
  surfaceId: string
  primarySessionId: string
  paneSessionIds: readonly string[]
}) {
  const paneSessionIdsRef = useRef(paneSessionIds)
  paneSessionIdsRef.current = paneSessionIds
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null)

  useEffect(() => {
    if (!dockviewApi) {
      return
    }
    return registerChatSplitDockviewApi(surfaceId, dockviewApi)
  }, [surfaceId, dockviewApi])

  const setFocusedSession = useChatSplitWorkspaceStore(state => state.setFocusedSession)
  const setLayout = useChatSplitWorkspaceStore(state => state.setLayout)
  const removePane = useChatSplitWorkspaceStore(state => state.removePane)
  const addPane = useChatSplitWorkspaceStore(state => state.addPane)

  const persistLayout = useCallback((api: DockviewApi) => {
    setLayout(surfaceId, api.toJSON())
  }, [setLayout, surfaceId])

  const addSessionPanel = useCallback((api: DockviewApi, sessionId: string, event: Pick<DockviewDidDropEvent, 'position' | 'group'>) => {
    const existingPanel = api.getPanel(sessionId)
    if (existingPanel) {
      existingPanel.api.setActive()
      return
    }

    const direction = positionToDirection(event.position)
    api.addPanel({
      id: sessionId,
      component: 'chatSession',
      title: CHAT_SESSION_FALLBACK_LABEL,
      params: panelParamsFor(sessionId, primarySessionId),
      position: event.group
        ? { direction, referenceGroup: event.group }
        : { direction: direction === 'within' ? 'right' : direction },
    })
    addPane(surfaceId, sessionId)
  }, [addPane, primarySessionId, surfaceId])

  const handleReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event
    setDockviewApi(api)

    const persistedLayout: SerializedDockview | null = useChatSplitWorkspaceStore.getState().workspaces[surfaceId]?.layout ?? null
    const pendingSplit = useChatSplitWorkspaceStore.getState().consumePendingSplit(surfaceId)

    let restored = false
    if (persistedLayout) {
      try {
        api.fromJSON(persistedLayout)
        restored = api.panels.length > 0
      }
      catch {
        api.clear()
      }
    }

    if (!restored) {
      for (const sessionId of paneSessionIdsRef.current) {
        if (api.getPanel(sessionId)) {
          continue
        }
        const isFirst = api.panels.length === 0
        api.addPanel({
          id: sessionId,
          component: 'chatSession',
          title: CHAT_SESSION_FALLBACK_LABEL,
          params: panelParamsFor(sessionId, primarySessionId),
          ...(isFirst
            ? {}
            : {
                position: pendingSplit && pendingSplit.sessionId === sessionId
                  ? { direction: pendingSplit.direction, referencePanel: primarySessionId }
                  : { direction: 'right' as const, referencePanel: primarySessionId },
              }),
        })
      }
      persistLayout(api)
    }

    api.onDidLayoutChange(() => persistLayout(api))

    api.onDidRemovePanel((panel) => {
      removePane(surfaceId, panel.id)
    })

    api.onDidActivePanelChange((activeEvent) => {
      const sessionId = activeEvent.panel?.params?.sessionId as string | undefined
      if (sessionId) {
        setFocusedSession(surfaceId, sessionId)
      }
    })

    api.onUnhandledDragOver((dragEvent) => {
      if (isSessionDragOverlayEvent(dragEvent)) {
        dragEvent.accept()
      }
    })

    api.onDidDrop((dropEvent) => {
      if (!(dropEvent.nativeEvent instanceof DragEvent)) {
        return
      }
      const sessionId = readDraggedSessionId(dropEvent.nativeEvent.dataTransfer)
      if (!sessionId) {
        return
      }
      addSessionPanel(api, sessionId, dropEvent)
    })
  }, [addSessionPanel, persistLayout, primarySessionId, removePane, setFocusedSession, surfaceId])

  return (
    <DockviewReact
      className="dockview-theme-cradle h-full w-full"
      theme={themeCradle}
      components={dockviewComponents}
      tabComponents={dockviewTabComponents}
      onReady={handleReady}
      noPanelsOverlay="emptyGroup"
    />
  )
}
