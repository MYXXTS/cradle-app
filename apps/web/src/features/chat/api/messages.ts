import {
  getChatSessionsBySessionIdMessagesOptions,
  getChatSessionsBySessionIdMessagesQueryKey,
} from '~/api-gen/@tanstack/react-query.gen'

export function chatMessageSnapshotQueryKey(sessionId: string) {
  return getChatSessionsBySessionIdMessagesQueryKey({ path: { sessionId } })
}

export function chatMessageSnapshotQueryOptions(sessionId: string) {
  return getChatSessionsBySessionIdMessagesOptions({ path: { sessionId } })
}
