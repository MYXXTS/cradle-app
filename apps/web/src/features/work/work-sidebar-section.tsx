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
      className={cn(
        'group flex min-w-0 items-center gap-1 rounded-lg px-2 py-1',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
      data-testid={`work-sidebar-row-${work.id}`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => openWork(work.id)}
      >
        <PullRequestIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs">{work.title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{pullRequestLabel}</span>
      </button>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" />}
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
  const { t } = useTranslation('work')
  if (works.length === 0) {
    return null
  }
  return (
    <section className="mb-1 flex min-w-0 flex-col" data-testid="work-sidebar-section">
      <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
        {t('sidebar.section')}
      </div>
      {works.map(work => <WorkRow key={work.id} work={work} />)}
    </section>
  )
}
