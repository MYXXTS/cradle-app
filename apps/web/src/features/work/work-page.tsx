import { useEffect, useRef } from 'react'

import { Spinner } from '~/components/ui/spinner'
import { ChatSessionRouteContent } from '~/features/chat/session/chat-session-route-content'
import { useSurfaceActive } from '~/navigation/surface-activity-context'
import { workSurfaceId } from '~/navigation/surface-identity'
import { useSurfaceStore } from '~/navigation/surface-store'
import { useLayoutStore } from '~/store/layout'

import { useWorkDetail } from './use-work'

export function WorkPage({ workId }: { workId: string }) {
  const active = useSurfaceActive()
  const initializedAsideRef = useRef(false)
  const updateSurfaceTitle = useSurfaceStore(state => state.updateSurfaceTitle)
  const openAsideTab = useLayoutStore(state => state.openAsideTab)
  const workQuery = useWorkDetail(workId)

  useEffect(() => {
    if (!workQuery.data) {
      return
    }
    updateSurfaceTitle(workSurfaceId(workId), workQuery.data.work.title)
  }, [updateSurfaceTitle, workId, workQuery.data])

  useEffect(() => {
    if (!active || !workQuery.data || initializedAsideRef.current) {
      return
    }
    initializedAsideRef.current = true
    openAsideTab('work')
  }, [active, openAsideTab, workQuery.data])

  if (workQuery.error) {
    throw workQuery.error
  }
  if (!workQuery.data) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="work-page-loading">
        <Spinner className="size-4" />
      </div>
    )
  }

  return (
    <ChatSessionRouteContent
      sessionId={workQuery.data.primaryThread.id}
      surfaceId={workSurfaceId(workId)}
      layoutSlotId={workSurfaceId(workId)}
    />
  )
}
