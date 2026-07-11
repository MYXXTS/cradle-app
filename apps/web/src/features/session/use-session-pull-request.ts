import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  markSessionPullRequestReady,
  readSessionPullRequest,
  sessionDetailQueryKey,
  sessionPullRequestQueryKey,
} from './api/pull-request'

export function useSessionPullRequest(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: sessionPullRequestQueryKey(sessionId ?? ''),
    queryFn: ({ signal }) => readSessionPullRequest(sessionId ?? '', signal),
    enabled: !!sessionId,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const pr = query.state.data
      return pr && pr.state === 'open' ? 30_000 : false
    },
  })
}

export function useMarkSessionPullRequestReady() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markSessionPullRequestReady,
    onSuccess: (pullRequest, sessionId) => {
      queryClient.setQueryData(sessionPullRequestQueryKey(sessionId), pullRequest)
      void queryClient.invalidateQueries({ queryKey: sessionDetailQueryKey(sessionId) })
    },
  })
}
