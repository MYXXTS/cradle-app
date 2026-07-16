import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

const ManagedResourcesPage = lazy(() => import('~/features/managed-resources/managed-resources-page').then(module => ({ default: module.ManagedResourcesPage })))

export const Route = createFileRoute('/resources')({
  component: ResourcesRoute,
})

function ResourcesRoute() {
  return (
    <Suspense fallback={null}>
      <ManagedResourcesPage />
    </Suspense>
  )
}
