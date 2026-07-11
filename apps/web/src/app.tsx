import { RouterProvider } from '@tanstack/react-router'

import { AppEnvironmentProviders } from '~/app-providers'
import { ProductAnalyticsRuntime } from '~/features/product-analytics/product-analytics-runtime'
import { router } from '~/router'

export function App() {
  'use no memo'

  return (
    <AppEnvironmentProviders>
      <ProductAnalyticsRuntime />
      <RouterProvider router={router} />
    </AppEnvironmentProviders>
  )
}
