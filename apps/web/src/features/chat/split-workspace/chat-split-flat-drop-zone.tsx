import type { ReactNode } from 'react'
import { useCallback, useRef, useState } from 'react'

import { isSessionDragEvent, readDraggedSessionId } from '~/features/workspace/session-drag-data'
import { cn } from '~/lib/utils'

import type { FlatSplitDirection } from './chat-split-drop-quadrant'
import { directionFromDropPoint } from './chat-split-drop-quadrant'
import { useChatSplitWorkspaceStore } from './chat-split-workspace-store'

const DIRECTION_OVERLAY_CLASSES: Record<FlatSplitDirection, string> = {
  left: 'inset-y-0 left-0 w-1/2',
  right: 'inset-y-0 right-0 w-1/2',
  above: 'inset-x-0 top-0 h-1/2',
  below: 'inset-x-0 bottom-0 h-1/2',
}

export function ChatSplitDropIndicator({ direction }: { direction: FlatSplitDirection }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute z-50 rounded-md border-2 transition-opacity duration-150 ease-out',
        DIRECTION_OVERLAY_CLASSES[direction],
      )}
      style={{
        backgroundColor: 'var(--dv-drag-over-background-color)',
        borderColor: 'var(--dv-drag-over-border-color)',
      }}
    />
  )
}

/**
 * Wraps the flat (non-split) chat view so a session dragged in from the
 * sidebar can create the very first split pane. Once a workspace has two or
 * more panes, `dockview` itself takes over drag-and-drop handling — this
 * component only exists to bootstrap that transition.
 */
export function ChatSplitFlatDropZone({
  surfaceId,
  primarySessionId,
  children,
}: {
  surfaceId: string
  primarySessionId: string
  children: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverDirection, setHoverDirection] = useState<FlatSplitDirection | null>(null)
  const addPane = useChatSplitWorkspaceStore(state => state.addPane)

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isSessionDragEvent(event.dataTransfer)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) {
      return
    }
    setHoverDirection(directionFromDropPoint(bounds, event))
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (containerRef.current && nextTarget instanceof Node && containerRef.current.contains(nextTarget)) {
      return
    }
    setHoverDirection(null)
  }, [])

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isSessionDragEvent(event.dataTransfer)) {
      return
    }
    event.preventDefault()
    const sessionId = readDraggedSessionId(event.dataTransfer)
    const bounds = containerRef.current?.getBoundingClientRect()
    setHoverDirection(null)

    if (!sessionId || sessionId === primarySessionId) {
      return
    }
    const direction = bounds ? directionFromDropPoint(bounds, event) : 'right'
    addPane(surfaceId, sessionId, direction)
  }, [addPane, primarySessionId, surfaceId])

  return (
    <div
      ref={containerRef}
      data-chat-split-drop-surface-id={surfaceId}
      data-chat-split-primary-session-id={primarySessionId}
      className="dockview-theme-cradle relative h-full w-full min-h-0 min-w-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {hoverDirection && <ChatSplitDropIndicator direction={hoverDirection} />}
    </div>
  )
}
