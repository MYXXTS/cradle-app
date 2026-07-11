import type { QueryClient } from '@tanstack/react-query'

import {
  getSessionsByIdOptions,
} from '~/api-gen/@tanstack/react-query.gen'

import { chatMessageSnapshotQueryOptions } from '../api/messages'

export function prefetchChatSession(queryClient: QueryClient, sessionId: string): void {
  void queryClient.prefetchQuery(getSessionsByIdOptions({ path: { id: sessionId } }))
  void queryClient.prefetchQuery(chatMessageSnapshotQueryOptions(sessionId))
}
