import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getSessionsByIdPullRequestOptions,
  getSessionsByIdPullRequestQueryKey,
  getSessionsByIdQueryKey,
  postSessionsByIdPullRequestReadyMutation,
} from '~/api-gen/@tanstack/react-query.gen'

export function sessionPullRequestQueryKey(sessionId: string) {
  return getSessionsByIdPullRequestQueryKey({ path: { id: sessionId } })
}

export function useSessionPullRequest(sessionId: string | null | undefined) {
  return useQuery({
    ...getSessionsByIdPullRequestOptions({ path: { id: sessionId ?? '' } }),
    enabled: !!sessionId,
    select: data => data.pullRequest,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const pr = query.state.data?.pullRequest
      return pr && pr.state === 'open' ? 30_000 : false
    },
  })
}

export function useMarkSessionPullRequestReady() {
  const queryClient = useQueryClient()
  return useMutation({
    ...postSessionsByIdPullRequestReadyMutation(),
    onSuccess: (data, options) => {
      const sessionId = options.path.id
      queryClient.setQueryData(sessionPullRequestQueryKey(sessionId), data)
      void queryClient.invalidateQueries({ queryKey: getSessionsByIdQueryKey({ path: { id: sessionId } }) })
    },
  })
}
