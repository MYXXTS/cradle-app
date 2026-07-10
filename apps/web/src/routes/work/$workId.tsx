import { createFileRoute } from '@tanstack/react-router'

import { RouteErrorFallback } from '~/components/common/route-error-fallback'
import { WorkPage } from '~/features/work/work-page'

export const Route = createFileRoute('/work/$workId')({
  errorComponent: RouteErrorFallback,
  component: WorkRoute,
})

function WorkRoute() {
  const { workId } = Route.useParams()
  return <WorkPage workId={workId} />
}
