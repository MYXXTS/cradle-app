import { createFileRoute } from '@tanstack/react-router'

import { ChatSplitWorkspace } from '~/features/chat/split-workspace/chat-split-workspace'

export const Route = createFileRoute('/chat/$sessionId')({
  component: ChatSessionRoute,
})

function ChatSessionRoute() {
  const { sessionId } = Route.useParams()
  return <ChatSplitWorkspace sessionId={sessionId} />
}
