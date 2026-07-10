import { GitBranchLine as BranchIcon, GitPullRequestLine as PullRequestIcon } from '@mingcute/react'
import { useTranslation } from 'react-i18next'

import { Badge } from '~/components/ui/badge'

import { useWorkDetail } from './use-work'

export function WorkHeaderChrome({ workId }: { workId: string }) {
  const { t } = useTranslation('work')
  const { data } = useWorkDetail(workId)
  if (!data) {
    return null
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5" data-testid="work-header-chrome">
      <Badge variant="outline">{t(`aside.activity.${data.activity}`)}</Badge>
      {data.readiness.branch && (
        <span className="hidden max-w-36 items-center gap-1 truncate text-[11px] text-muted-foreground xl:inline-flex">
          <BranchIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{data.readiness.branch}</span>
        </span>
      )}
      {data.pullRequest && (
        <a
          href={data.pullRequest.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PullRequestIcon className="size-3" aria-hidden="true" />
          {`#${data.pullRequest.number}`}
        </a>
      )}
    </div>
  )
}
