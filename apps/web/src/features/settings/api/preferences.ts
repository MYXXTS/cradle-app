import {
  getPreferencesAppOptions,
  getPreferencesAppQueryKey,
  getPreferencesChatOptions,
  getPreferencesChatQueryKey,
  getPreferencesCodexOptions,
  getPreferencesCodexQueryKey,
  getPreferencesDesktopOptions,
  getPreferencesDesktopQueryKey,
  getPreferencesNetworkOptions,
  getPreferencesNetworkQueryKey,
  getPreferencesNetworkStatusOptions,
  getPreferencesNetworkStatusQueryKey,
} from '~/api-gen/@tanstack/react-query.gen'
import {
  putPreferencesApp,
  putPreferencesChat,
  putPreferencesCodex,
  putPreferencesDesktop,
  putPreferencesNetwork,
} from '~/api-gen/sdk.gen'

export const preferencesGateway = {
  app: {
    queryKey: getPreferencesAppQueryKey(),
    queryOptions: getPreferencesAppOptions,
    update: async (body: Parameters<typeof putPreferencesApp>[0]['body']) => {
      const { data } = await putPreferencesApp({ body, throwOnError: true })
      return data
    },
  },
  chat: {
    queryKey: getPreferencesChatQueryKey(),
    queryOptions: getPreferencesChatOptions,
    update: async (body: Parameters<typeof putPreferencesChat>[0]['body']) => {
      const { data } = await putPreferencesChat({ body, throwOnError: true })
      return data
    },
  },
  codex: {
    queryKey: getPreferencesCodexQueryKey(),
    queryOptions: getPreferencesCodexOptions,
    update: async (body: Parameters<typeof putPreferencesCodex>[0]['body']) => {
      const { data } = await putPreferencesCodex({ body, throwOnError: true })
      return data
    },
  },
  desktop: {
    queryKey: getPreferencesDesktopQueryKey(),
    queryOptions: getPreferencesDesktopOptions,
    update: async (body: Parameters<typeof putPreferencesDesktop>[0]['body']) => {
      const { data } = await putPreferencesDesktop({ body, throwOnError: true })
      return data
    },
  },
  network: {
    queryKey: getPreferencesNetworkQueryKey(),
    queryOptions: getPreferencesNetworkOptions,
    statusQueryKey: getPreferencesNetworkStatusQueryKey(),
    statusQueryOptions: getPreferencesNetworkStatusOptions,
    update: async (body: Parameters<typeof putPreferencesNetwork>[0]['body']) => {
      const { data } = await putPreferencesNetwork({ body, throwOnError: true })
      return data
    },
  },
} as const
