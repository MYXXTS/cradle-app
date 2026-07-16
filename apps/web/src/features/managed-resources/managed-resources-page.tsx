import {
  DeleteLine as DeleteIcon,
  DownloadLine as DownloadIcon,
  Refresh1Line as UpdateIcon,
} from '@mingcute/react'
import { useQueryClient } from '@tanstack/react-query'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Skeleton } from '~/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group'
import { TruncatedText } from '~/components/ui/truncated-text'
import { DownloadTaskRow } from '~/features/download-center/download-center-chrome'
import type { DownloadTask } from '~/features/download-center/types'
import { isActiveDownload } from '~/features/download-center/types'
import {
  useDownloadCenter,
  useDownloadCenterOwner,
} from '~/features/download-center/use-download-center'
import { cn } from '~/lib/cn'
import { formatCompactBytes } from '~/lib/number-format'

import { getManagedResourcesQueryKey } from './api/managed-resources-api'
import type { ManagedResource } from './projection'
import { managedResourceKey, projectResourceTransferProgress } from './projection'
import { useManagedResourceAction, useManagedResources } from './use-managed-resources'

type PageFace = 'library' | 'activity'
type TransferStatusFilter = 'all' | 'active' | 'completed' | 'failed' | 'cancelled'
type TransferScopeFilter = 'all' | DownloadTask['scope']

function stateKey(state: ManagedResource['state']) {
  return `state.${state}` as const
}

function MetaCell({ label, value }: { label: string, value: string }) {
  return (
    <div className="w-full min-w-0">
      <p className="text-[10px] uppercase tracking-[0.04em] text-muted-foreground">{label}</p>
      <TruncatedText
        maxLines={1}
        className="mt-0.5 block w-full font-mono text-xs font-medium tabular-nums text-foreground/85"
      >
        {value}
      </TruncatedText>
    </div>
  )
}

/** Shared track so Installed / Available / Size / Source / Actions line up across rows. */
const RESOURCE_ROW_GRID
  = 'grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-[minmax(0,1fr)_9rem_9rem_4.5rem_5.5rem_9rem] md:items-start'

function ProgressLine({ percent }: { percent: number | null }) {
  return (
    <div
      className="mt-2.5 h-0.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-150 ease-out',
          percent === null && 'w-1/3',
        )}
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </div>
  )
}

function ResourceRow({ resource }: { resource: ManagedResource }) {
  const { t } = useTranslation('resources')
  const queryClient = useQueryClient()
  const tasks = useDownloadCenterOwner(resource.key)
  const progress = projectResourceTransferProgress(tasks)
  const action = useManagedResourceAction(resource)
  const terminalRevision = tasks
    .filter(task => !isActiveDownload(task))
    .map(task => `${task.taskId}:${task.status}:${task.updatedAt}`)
    .join('|')
  const previousTerminalRevisionRef = useRef(terminalRevision)
  const primaryAction = resource.actions.update.available
    ? 'update'
    : resource.actions.install.available
      ? 'install'
      : null
  const installing = progress.activeTasks.length > 0 || resource.state === 'installing'

  useEffect(() => {
    if (previousTerminalRevisionRef.current === terminalRevision) {
      return
    }
    previousTerminalRevisionRef.current = terminalRevision
    void queryClient.invalidateQueries({ queryKey: getManagedResourcesQueryKey() })
  }, [queryClient, terminalRevision])

  return (
    <article
      className="border-b border-border/60 py-4 first:pt-3 last:border-b-0"
      data-testid={`managed-resource-${managedResourceKey(resource)}`}
    >
      <div className={RESOURCE_ROW_GRID}>
        <div className="col-span-2 min-w-0 md:col-span-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <TruncatedText maxLines={1} className="min-w-0 text-sm font-semibold text-foreground">
              {resource.displayName}
            </TruncatedText>
            <span className="shrink-0 text-xs text-muted-foreground">{t(stateKey(resource.state))}</span>
            {resource.required
              ? <span className="shrink-0 text-[11px] text-muted-foreground/80">{t('required')}</span>
              : null}
            <span className="shrink-0 text-[11px] capitalize text-muted-foreground/70">{resource.kind}</span>
          </div>
          {resource.description
            ? (
                <TruncatedText maxLines={2} className="mt-1 text-xs leading-5 text-muted-foreground">
                  {resource.description}
                </TruncatedText>
              )
            : null}
          {installing ? <ProgressLine percent={progress.percent} /> : null}
          {installing && progress.activeTasks.length > 0
            ? (
                <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatCompactBytes(progress.transferredBytes)}
                  {progress.totalBytes === null ? '' : ` / ${formatCompactBytes(progress.totalBytes)}`}
                </p>
              )
            : null}
        </div>

        <MetaCell label={t('version.installed')} value={resource.installedVersion ?? '—'} />
        <MetaCell label={t('version.available')} value={resource.availableVersion ?? '—'} />
        <MetaCell
          label={t('size')}
          value={resource.installedSizeBytes === null
            ? '—'
            : formatCompactBytes(resource.installedSizeBytes)}
        />
        <MetaCell
          label={t('meta.source')}
          value={resource.installationSource
            ? t(`source.${resource.installationSource}`)
            : '—'}
        />

        <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1 md:w-full">
          {primaryAction
            ? (
                <Button
                  type="button"
                  size="sm"
                  variant={primaryAction === 'update' ? 'default' : 'outline'}
                  className="transition-transform active:scale-[0.96]"
                  disabled={action.isPending || progress.activeTasks.length > 0}
                  onClick={() => action.mutate(primaryAction)}
                >
                  {primaryAction === 'update'
                    ? <UpdateIcon data-icon="inline-start" />
                    : <DownloadIcon data-icon="inline-start" />}
                  {resource.installationSource === 'external' && primaryAction === 'install'
                    ? t('action.installManaged')
                    : t(`action.${primaryAction}`)}
                </Button>
              )
            : installing && progress.percent !== null
              ? (
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {progress.percent}
                    %
                  </span>
                )
              : null}
          {resource.actions.uninstall.available
            ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-10 text-muted-foreground transition-transform active:scale-[0.96]"
                      aria-label={t('action.uninstall')}
                    >
                      <DeleteIcon />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('uninstall.title', { name: resource.displayName })}</AlertDialogTitle>
                      <AlertDialogDescription>{t('uninstall.description')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => action.mutate('uninstall')}>
                        {t('action.uninstall')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )
            : null}
        </div>
      </div>

      {action.isError ? <p className="mt-3 text-xs text-destructive">{t('action.failed')}</p> : null}
      {!action.isError && progress.failedTask && resource.state !== 'installed'
        ? <p className="mt-3 text-xs text-destructive">{t('transfer.failed')}</p>
        : null}
    </article>
  )
}

const MemoizedResourceRow = memo(ResourceRow)

function LibraryFace() {
  const { t } = useTranslation('resources')
  const { resources, isLoading, isError, refetch } = useManagedResources()

  if (isLoading && resources.length === 0) {
    return (
      <div className="space-y-0 divide-y divide-border/60">
        {[0, 1, 2, 3].map(index => (
          <Skeleton key={index} className="h-20 w-full rounded-none bg-muted/40" />
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 transition-transform active:scale-[0.96]"
          onClick={() => void refetch()}
        >
          <UpdateIcon data-icon="inline-start" />
          {t('action.retry')}
        </Button>
      </div>
    )
  }
  if (resources.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{t('empty.resources')}</p>
  }

  return (
    <div>
      {resources.map(resource => (
        <MemoizedResourceRow key={managedResourceKey(resource)} resource={resource} />
      ))}
    </div>
  )
}

function ActivityFace() {
  const { t } = useTranslation('resources')
  const { tasks } = useDownloadCenter()
  const [status, setStatus] = useState<TransferStatusFilter>('all')
  const [scope, setScope] = useState<TransferScopeFilter>('all')
  const visibleTasks = useMemo(() => tasks
    .filter(task => scope === 'all' || task.scope === scope)
    .filter((task) => {
      if (status === 'all') {
        return true
      }
      if (status === 'active') {
        return isActiveDownload(task)
      }
      return task.status === status
    })
    .toSorted((left, right) =>
      Number(isActiveDownload(right)) - Number(isActiveDownload(left))
      || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [scope, status, tasks])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t('filter.channel')}</span>
          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(value) => {
              if (value === 'all' || value === 'server' || value === 'desktop') {
                setScope(value)
              }
            }}
            variant="outline"
            size="sm"
            className="h-8 gap-px rounded-lg bg-muted/50 p-0.5"
            aria-label={t('filter.channel')}
          >
            {(['all', 'server', 'desktop'] as const).map(value => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-7 rounded-md px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-none"
              >
                {t(`filter.scope.${value}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Select value={status} onValueChange={value => setStatus(value as TransferStatusFilter)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['all', 'active', 'completed', 'failed', 'cancelled'] as const).map(value => (
              <SelectItem key={value} value={value}>{t(`filter.status.${value}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {visibleTasks.length === 0
        ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{t('empty.transfers')}</p>
          )
        : (
            <div className="divide-y divide-border/60 border-t border-border/60">
              {visibleTasks.map(task => (
                <div
                  key={`${task.scope}:${task.taskId}`}
                  className="py-3 [contain-intrinsic-size:0_88px] [content-visibility:auto]"
                >
                  <DownloadTaskRow task={task} showFileName />
                </div>
              ))}
            </div>
          )}
    </div>
  )
}

function FaceSwitch({
  face,
  onChange,
  libraryCount,
  activeTransferCount,
}: {
  face: PageFace
  onChange: (next: PageFace) => void
  libraryCount: number
  activeTransferCount: number
}) {
  const { t } = useTranslation('resources')

  return (
    <ToggleGroup
      type="single"
      value={face}
      onValueChange={(value) => {
        if (value === 'library' || value === 'activity') {
          onChange(value)
        }
      }}
      variant="outline"
      size="sm"
      className="h-9 gap-px rounded-[10px] bg-muted/55 p-[3px]"
      aria-label={t('face.switch')}
    >
      <ToggleGroupItem
        value="library"
        className="h-8 gap-2 rounded-lg px-3.5 text-[13px] data-[state=on]:bg-background data-[state=on]:font-semibold data-[state=on]:shadow-none"
      >
        {t('tab.library')}
        <span className="font-normal tabular-nums text-muted-foreground">{libraryCount}</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="activity"
        className="h-8 gap-2 rounded-lg px-3.5 text-[13px] data-[state=on]:bg-background data-[state=on]:font-semibold data-[state=on]:shadow-none"
      >
        {t('tab.activity')}
        <span className="font-normal tabular-nums text-muted-foreground">{activeTransferCount}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export function ManagedResourcesPage() {
  const { t } = useTranslation('resources')
  const { resources } = useManagedResources()
  const { active } = useDownloadCenter()
  const [face, setFace] = useState<PageFace>('library')
  const updateCount = useMemo(
    () => resources.filter(resource => resource.state === 'update-available').length,
    [resources],
  )
  const installedCount = useMemo(
    () => resources.filter(resource =>
      resource.state === 'installed' || resource.state === 'update-available').length,
    [resources],
  )
  const installingCount = useMemo(
    () => resources.filter(resource => resource.state === 'installing').length,
    [resources],
  )

  return (
    <div className="h-full overflow-y-auto" data-testid="managed-resources-page">
      <div className="mx-auto max-w-[58rem] px-6 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h1 className="text-balance text-[1.375rem] font-semibold tracking-tight text-foreground">
              {t('title')}
            </h1>
            <p className="mt-1.5 text-pretty text-[13px] leading-5 text-muted-foreground">
              {t('description')}
            </p>
          </div>
          <p className="text-right text-[11px] tabular-nums text-muted-foreground">
            {t('summary.live', {
              transferring: active.length,
              updates: updateCount,
            })}
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <FaceSwitch
            face={face}
            onChange={setFace}
            libraryCount={resources.length}
            activeTransferCount={active.length}
          />
          <div className="flex-1" />
          {face === 'library'
            ? (
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t('summary.library', {
                    declared: resources.length,
                    installed: installedCount,
                    installing: installingCount,
                  })}
                </p>
              )
            : null}
        </div>

        <div className="mt-4 border-t border-border/70 pt-1">
          {face === 'library' ? <LibraryFace /> : <ActivityFace />}
        </div>
      </div>
    </div>
  )
}
