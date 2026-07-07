import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

const NewChatPage = lazy(() => import('~/features/new-chat/new-chat-page').then(module => ({ default: module.NewChatPage })))

type NewChatSearch = {
  issueId?: string
  workspaceId?: string
  sessionGroupId?: string
}

export const Route = createFileRoute('/chat/new')({
  validateSearch: (search: Record<string, unknown>): NewChatSearch => ({
    issueId: typeof search.issueId === 'string' && search.issueId.length > 0 ? search.issueId : undefined,
    workspaceId: typeof search.workspaceId === 'string' && search.workspaceId.length > 0 ? search.workspaceId : undefined,
    sessionGroupId: typeof search.sessionGroupId === 'string' && search.sessionGroupId.length > 0 ? search.sessionGroupId : undefined,
  }),
  component: NewChatRoute,
})

function NewChatRoute() {
  return (
    <Suspense fallback={null}>
      <NewChatPage />
    </Suspense>
  )
}
