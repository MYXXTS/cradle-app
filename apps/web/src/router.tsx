import { createHashHistory, createRouter } from '@tanstack/react-router'

import { RouteErrorFallback } from './components/common/route-error-fallback'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
  defaultErrorComponent: RouteErrorFallback,
  defaultPendingComponent: () => null,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
