import { createFileRoute } from '@tanstack/react-router'

import { NewWorkPage } from '~/features/new-work/new-work-page'

type NewWorkSearch = {
  workspaceId?: string
  issueId?: string
}

export const Route = createFileRoute('/work/new')({
  validateSearch: (search: Record<string, unknown>): NewWorkSearch => ({
    workspaceId: typeof search.workspaceId === 'string' && search.workspaceId.length > 0
      ? search.workspaceId
      : undefined,
    issueId: typeof search.issueId === 'string' && search.issueId.length > 0
      ? search.issueId
      : undefined,
  }),
  component: NewWorkPage,
})
