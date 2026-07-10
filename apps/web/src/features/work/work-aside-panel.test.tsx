import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkAsidePanel } from './work-aside-panel'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  markReady: vi.fn(),
  repair: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('./use-work', () => ({
  useWorkDetail: () => ({
    data: {
      work: {
        id: 'work-1',
        title: 'Fix retries',
        objective: 'Make retries deterministic.',
        linkedIssueId: null,
        handoffTitle: 'Fix retries',
        handoffSummary: 'Implemented deterministic retries.',
        handoffTestPlan: 'Run focused tests.',
        preparedAt: 20,
        lastSubmittedAt: 10,
        closedAt: null,
        archivedAt: null,
        createdAt: 1,
        updatedAt: 20,
      },
      primaryThread: {
        id: 'session-1',
        workspaceId: 'workspace-1',
      },
      execution: {
        worktreeId: 'worktree-1',
        worktreeBranch: 'cradle/wt/work-1',
        worktreeHealth: 'ok',
      },
      readiness: {
        isolated: true,
        clean: true,
        branch: 'cradle/wt/work-1',
        baseRef: 'base',
        commitsAhead: 1,
        changedFiles: 0,
      },
      pullRequest: null,
      activity: 'idle',
    },
    refetch: vi.fn(),
  }),
  useSubmitWork: () => ({
    mutateAsync: mocks.submit,
    isPending: false,
    error: null,
  }),
}))

vi.mock('~/features/session/use-session-isolation', () => ({
  useRepairSessionIsolation: () => ({
    mutateAsync: mocks.repair,
    isPending: false,
    error: null,
  }),
}))

vi.mock('~/features/session/use-session-pull-request', () => ({
  useMarkSessionPullRequestReady: () => ({
    mutateAsync: mocks.markReady,
    isPending: false,
    error: null,
  }),
}))

describe('work aside panel delivery control', () => {
  beforeEach(() => {
    mocks.submit.mockReset().mockResolvedValue(undefined)
    mocks.markReady.mockReset().mockResolvedValue(undefined)
    mocks.repair.mockReset().mockResolvedValue(undefined)
  })

  it('submits only after the user clicks Create Draft PR', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkAsidePanel workId="work-1" />
      </QueryClientProvider>,
    )

    expect(mocks.submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('work-submit'))
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.submit).toHaveBeenCalledWith({
      path: { id: 'work-1' },
      body: {},
    })
  })
})
