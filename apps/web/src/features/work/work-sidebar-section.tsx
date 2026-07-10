import {
  ArchiveLine as ArchiveIcon,
  GitPullRequestLine as PullRequestIcon,
  More2Line as MoreIcon,
} from '@mingcute/react'
import { useTranslation } from 'react-i18next'

import { Button } from '~/components/ui/button'
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '~/components/ui/menu'
import { cn } from '~/lib/cn'
import { useIsActiveSurfaceId } from '~/navigation/active-surface'
import { openWork } from '~/navigation/navigation-commands'
import { workSurfaceId } from '~/navigation/surface-identity'

import type { WorkSummary } from './use-work'
import { useArchiveWork } from './use-work'

function WorkRow({ work }: { work: WorkSummary }) {
  const { t } = useTranslation('work')
  const active = useIsActiveSurfaceId(workSurfaceId(work.id))
  const archiveWork = useArchiveWork()
  const pullRequestLabel = work.pullRequest
    ? work.pullRequest.merged
      ? t('sidebar.merged', { number: work.pullRequest.number })
      : work.pullRequest.isDraft
        ? t('sidebar.draft', { number: work.pullRequest.number })
        : t('sidebar.ready', { number: work.pullRequest.number })
    : t(`aside.activity.${work.activity}`)

  return (
    <div
      className="group relative isolate flex min-w-0 w-full items-center rounded-lg text-left text-xs hover:bg-accent/50"
      data-testid={`work-sidebar-row-${work.id}`}
    >
      {/* Active state is a dedicated background layer so the interactive
          content can sit at z-10 above it — mirrors SessionItem's hierarchy. */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 rounded-lg transition-colors',
          active ? 'bg-accent/80' : 'bg-transparent',
        )}
      />
      <button
        type="button"
        onClick={() => openWork(work.id)}
        className="relative z-10 flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-sidebar-foreground/80"
      >
        <PullRequestIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{work.title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{pullRequestLabel}</span>
      </button>
      <Menu>
        <MenuTrigger
          render={(
            <Button
              variant="ghost"
              size="icon-xs"
              className="relative z-10 mr-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            />
          )}
          aria-label={t('sidebar.open')}
        >
          <MoreIcon />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem onClick={() => openWork(work.id)}>
            <PullRequestIcon className="size-3" />
            {t('sidebar.open')}
          </MenuItem>
          <MenuItem
            onClick={() => void archiveWork.mutateAsync({
              path: { id: work.id },
              body: { archived: true },
            })}
          >
            <ArchiveIcon className="size-3" />
            {t('sidebar.archive')}
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  )
}

export function WorkSidebarSection({ works }: { works: WorkSummary[] }) {
  if (works.length === 0) {
    return null
  }
  return (
    <section className="ml-4.25 flex min-w-0 flex-col gap-0.5 border-l border-sidebar-border/50 pl-2 py-0.5" data-testid="work-sidebar-section">
      {works.map(work => <WorkRow key={work.id} work={work} />)}
    </section>
  )
}
