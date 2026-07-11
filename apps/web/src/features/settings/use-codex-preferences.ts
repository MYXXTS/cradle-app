// Codex preferences query and mutation helpers for settings-owned runtime defaults.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { preferencesGateway } from './api/preferences'

export interface CodexPreferences {
  useCradleUserAgent: boolean
}

const CodexPreferencesSchema = z.object({
  useCradleUserAgent: z.boolean().default(true),
})

export const CODEX_PREFS_QUERY_KEY = preferencesGateway.codex.queryKey

export function useCodexPreferencesQuery() {
  return useQuery({
    ...preferencesGateway.codex.queryOptions(),
    select: data => CodexPreferencesSchema.parse(data) satisfies CodexPreferences,
  })
}

export function useUpdateCodexPreferencesMutation() {
  const queryClient = useQueryClient()

  return useMutation<CodexPreferences | null, Error, Partial<CodexPreferences>>({
    mutationFn: async (updates) => {
      const current = queryClient.getQueryData<CodexPreferences>(CODEX_PREFS_QUERY_KEY)
      if (!current) {
        return null
      }

      const next = { ...current, ...updates }
      await preferencesGateway.codex.update(next)

      return next
    },
    onSuccess: (updated) => {
      if (updated) {
        queryClient.setQueryData(CODEX_PREFS_QUERY_KEY, updated)
      }
    },
  })
}

export function useCodexPreferences() {
  const { data: prefs, isLoading, isSuccess } = useCodexPreferencesQuery()
  const { mutateAsync: savePrefs, isPending: isSaving } = useUpdateCodexPreferencesMutation()

  return { prefs: prefs ?? null, isLoading, isSuccess, savePrefs, isSaving }
}
