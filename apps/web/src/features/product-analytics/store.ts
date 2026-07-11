import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistStorage } from '~/store/persist-storage'

export const PRODUCT_ANALYTICS_STORAGE_KEY = 'cradle:product-analytics:v1'

interface ProductAnalyticsState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

export const useProductAnalyticsStore = create<ProductAnalyticsState>()(
  persist(
    set => ({
      enabled: true,
      setEnabled: enabled => set({ enabled }),
    }),
    {
      name: PRODUCT_ANALYTICS_STORAGE_KEY,
      storage: persistStorage,
      version: 1,
      partialize: state => ({ enabled: state.enabled }),
    },
  ),
)
