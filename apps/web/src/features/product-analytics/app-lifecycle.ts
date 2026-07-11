import type { ProductAnalyticsEventMap } from './event-model'

const PRODUCT_ANALYTICS_LIFECYCLE_STORAGE_KEY = 'cradle:product-analytics:lifecycle:v1'

interface StoredProductAnalyticsLifecycle {
  lastVersion: string
}

export function readAppOpenAnalyticsProperties(
  currentVersion: string,
): ProductAnalyticsEventMap['app_opened'] {
  const previousVersion = readPreviousVersion()
  const lifecycleStage = previousVersion === null
    ? 'first_seen'
    : previousVersion === currentVersion
      ? 'returning'
      : 'updated'

  writeCurrentVersion(currentVersion)

  return {
    lifecycle_stage: lifecycleStage,
    previous_version: previousVersion,
  }
}

function readPreviousVersion(): string | null {
  try {
    const value = localStorage.getItem(PRODUCT_ANALYTICS_LIFECYCLE_STORAGE_KEY)
    if (!value) {
      return null
    }
    const stored: StoredProductAnalyticsLifecycle = JSON.parse(value)
    return typeof stored.lastVersion === 'string' && stored.lastVersion.length > 0
      ? stored.lastVersion
      : null
  }
  catch {
    return null
  }
}

function writeCurrentVersion(currentVersion: string): void {
  try {
    const stored: StoredProductAnalyticsLifecycle = { lastVersion: currentVersion }
    localStorage.setItem(PRODUCT_ANALYTICS_LIFECYCLE_STORAGE_KEY, JSON.stringify(stored))
  }
  catch {}
}
