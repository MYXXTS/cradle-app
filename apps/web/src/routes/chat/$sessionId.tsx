import { createFileRoute } from '@tanstack/react-router'

import { RouteErrorFallback } from '~/components/common/route-error-fallback'
import { ChatSplitWorkspace } from '~/features/chat/split-workspace/chat-split-workspace'

export const Route = createFileRoute('/chat/$sessionId')({
  errorComponent: RouteErrorFallback,
  component: ChatSessionRoute,
})

function ChatSessionRoute() {
  const { sessionId } = Route.useParams()
  return <ChatSplitWorkspace sessionId={sessionId} />
}
