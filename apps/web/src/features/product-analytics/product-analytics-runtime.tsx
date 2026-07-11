import { useEffect, useRef } from 'react'

import { isTearoffWindow } from '~/lib/electron'
import { useActiveSurface } from '~/navigation/active-surface'

import { readAppOpenAnalyticsProperties } from './app-lifecycle'
import {
  featureDomainForSurface,
  syncProductAnalyticsEnabled,
  trackProductEvent,
} from './client'
import { PRODUCT_ANALYTICS_STORAGE_KEY, useProductAnalyticsStore } from './store'

let appOpenedCaptured = false

export function ProductAnalyticsRuntime() {
  const enabled = useProductAnalyticsStore(state => state.enabled)
  const surface = useActiveSurface()
  const lastSurfaceRef = useRef<string | null>(null)

  useEffect(() => {
    syncProductAnalyticsEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PRODUCT_ANALYTICS_STORAGE_KEY) {
        void useProductAnalyticsStore.persist.rehydrate()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(() => {
    if (!enabled || isTearoffWindow || appOpenedCaptured) {
      return
    }
    appOpenedCaptured = true
    const appVersion = import.meta.env.PACKAGE_VERSION ?? '0.0.0'
    trackProductEvent('app_opened', readAppOpenAnalyticsProperties(appVersion))
  }, [enabled])

  useEffect(() => {
    if (!enabled || !surface || document.visibilityState !== 'visible') {
      return
    }
    if (lastSurfaceRef.current === surface.kind) {
      return
    }
    lastSurfaceRef.current = surface.kind
    trackProductEvent('surface_viewed', {
      surface: surface.kind,
      feature_domain: featureDomainForSurface(surface.kind),
    })
  }, [enabled, surface])

  return null
}
