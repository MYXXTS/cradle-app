import { createFileRoute } from '@tanstack/react-router'

import { RouteErrorFallback } from '~/components/common/route-error-fallback'
import { WorkspaceDetailRouteContent } from '~/features/workspace-detail/workspace-detail-route-content'

export const Route = createFileRoute('/workspaces/$workspaceId/')({
  errorComponent: RouteErrorFallback,
  component: WorkspaceDetailRoute,
})

function WorkspaceDetailRoute() {
  const { workspaceId } = Route.useParams()
  return <WorkspaceDetailRouteContent workspaceId={workspaceId} />
}
