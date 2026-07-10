import { ExternalLinkLine as ExternalLinkIcon } from '@mingcute/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getWorksByIdQueryKey } from '~/api-gen/@tanstack/react-query.gen'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import { Spinner } from '~/components/ui/spinner'
import { useRepairSessionIsolation } from '~/features/session/use-session-isolation'
import { useMarkSessionPullRequestReady } from '~/features/session/use-session-pull-request'
import { apiErrorMessage } from '~/lib/api-error'
import { useLayoutStore } from '~/store/layout'

import { useSubmitWork, useWorkDetail } from './use-work'

export function WorkAsidePanel({ workId }: { workId: string }) {
  const { t } = useTranslation('work')
  const queryClient = useQueryClient()
  const workQuery = useWorkDetail(workId)
  const submitWork = useSubmitWork()
  const markReady = useMarkSessionPullRequestReady()
  const repair = useRepairSessionIsolation()
  const openAsideTab = useLayoutStore(state => state.openAsideTab)
  const detail = workQuery.data

  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-4" />
      </div>
    )
  }

  const preparedForDelivery = detail.work.preparedAt !== null
    && (detail.work.lastSubmittedAt === null || detail.work.preparedAt > detail.work.lastSubmittedAt)
  const pullRequest = detail.pullRequest
  const canSubmit = preparedForDelivery
    && detail.readiness.isolated
    && detail.readiness.clean
    && detail.readiness.commitsAhead > 0
  const activityLabel = t(`aside.activity.${detail.activity}`)

  const handleSubmit = async () => {
    await submitWork.mutateAsync({
      path: { id: workId },
      body: {},
    })
  }

  const handleMarkReady = async () => {
    await markReady.mutateAsync(detail.primaryThread.id)
    await queryClient.invalidateQueries({
      queryKey: getWorksByIdQueryKey({ path: { id: workId } }),
    })
  }

  const deliveryError = submitWork.error ?? markReady.error ?? repair.error

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3" data-testid="work-aside-panel">
      {preparedForDelivery && (
        <Card size="sm" className="border border-primary/25 bg-primary/5 ring-0">
          <CardHeader>
            <CardTitle>{t('aside.readyToSubmit')}</CardTitle>
            <CardDescription>{t('aside.localOnly')}</CardDescription>
          </CardHeader>
          <CardFooter className="gap-2 border-primary/15 bg-primary/5">
            <Button type="button" size="sm" variant="outline" onClick={() => openAsideTab('changes')}>
              {t('aside.reviewChanges')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit || submitWork.isPending}
              onClick={() => void handleSubmit()}
              data-testid="work-submit"
            >
              {submitWork.isPending
                ? <Spinner className="size-3" />
                : pullRequest
                  ? t('aside.updateDraft')
                  : t('aside.createDraft')}
            </Button>
          </CardFooter>
        </Card>
      )}

      {pullRequest && !preparedForDelivery && (
        <Card size="sm" className="border border-border bg-card ring-0">
          <CardHeader>
            <CardTitle>{t('aside.readyForReview')}</CardTitle>
            <CardDescription>{t('aside.draftLatest', { number: pullRequest.number })}</CardDescription>
          </CardHeader>
          <CardFooter className="flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => openAsideTab('changes')}>
              {t('aside.reviewChanges')}
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <a href={pullRequest.url} target="_blank" rel="noreferrer">
                {t('aside.openPr')}
                <ExternalLinkIcon className="size-3" aria-hidden="true" />
              </a>
            </Button>
            {pullRequest.isDraft && pullRequest.state === 'open' && !pullRequest.merged && (
              <Button
                type="button"
                size="sm"
                disabled={markReady.isPending}
                onClick={() => void handleMarkReady()}
              >
                {markReady.isPending ? t('aside.markingReady') : t('aside.markReady')}
              </Button>
            )}
          </CardFooter>
        </Card>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-foreground">{t('aside.objective')}</h3>
          <Badge variant="outline">{activityLabel}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {detail.work.objective}
        </p>
      </section>

      <Separator />

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-foreground">{t('aside.execution')}</h3>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>
            {`${t('aside.managedWorktree')} · ${detail.execution.worktreeBranch ?? detail.execution.worktreeId}`}
          </div>
          <div>
            {detail.readiness.clean
              ? t('aside.clean')
              : t('aside.changedFiles', { count: detail.readiness.changedFiles })}
            {' · '}
            {t('aside.commitsAhead', { count: detail.readiness.commitsAhead })}
          </div>
        </div>
        {detail.execution.worktreeHealth !== 'ok' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={repair.isPending}
            onClick={() => void repair.mutateAsync({
              sessionId: detail.primaryThread.id,
              workspaceId: detail.primaryThread.workspaceId,
            }).then(() => workQuery.refetch())}
          >
            {repair.isPending ? <Spinner className="size-3" /> : t('new.tryAgain')}
          </Button>
        )}
      </section>

      <Separator />

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-foreground">{t('aside.handoff')}</h3>
        {detail.work.handoffSummary || detail.work.handoffTestPlan
          ? (
              <div className="space-y-3 text-xs leading-5 text-muted-foreground">
                {detail.work.handoffSummary && <p className="whitespace-pre-wrap">{detail.work.handoffSummary}</p>}
                {detail.work.handoffTestPlan && <p className="whitespace-pre-wrap">{detail.work.handoffTestPlan}</p>}
              </div>
            )
          : <p className="text-xs text-muted-foreground">{t('aside.notPrepared')}</p>}
      </section>

      {deliveryError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {`${t('aside.submitFailed')} ${apiErrorMessage(deliveryError)}`}
        </div>
      )}
    </div>
  )
}
