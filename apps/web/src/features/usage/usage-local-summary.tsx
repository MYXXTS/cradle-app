import { useTranslation } from 'react-i18next'

import { Skeleton } from '~/components/ui/skeleton'
import { cn } from '~/lib/cn'
import { formatTokenCount } from '~/lib/number-format'

import type { LocalUsageSummary } from './use-usage-overview'

export const UsageLocalSummary = ({
  summary,
  isLoading,
  isError,
  className,
}: {
  summary: LocalUsageSummary | null
  isLoading: boolean
  isError: boolean
  className?: string
}) => {
  const { t } = useTranslation('usage')

  if (isLoading && !summary) {
    return (
      <div className={cn('mt-8 rounded-2xl bg-card p-5 ring-1 ring-foreground/8 shadow-[var(--shadow-sm)]', className)}>
        <span className="sr-only">{t('local.loading')}</span>
        <Skeleton className="h-3 w-28 rounded-full" />
        <Skeleton className="mt-2 h-9 w-32 rounded-md" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      </div>
    )
  }

  if (isError && !summary) {
    return (
      <div className={cn('mt-8 rounded-2xl bg-card p-5 ring-1 ring-foreground/8 shadow-[var(--shadow-sm)]', className)}>
        <p className="text-xs text-muted-foreground">{t('local.title')}</p>
        <p className="mt-1 text-sm text-text-secondary">{t('local.error')}</p>
      </div>
    )
  }

  if (!summary) {
    return null
  }

  return (
    <div className={cn('mt-8 rounded-2xl bg-card p-5 ring-1 ring-foreground/8 shadow-[var(--shadow-sm)]', className)}>
      <p className="text-xs text-muted-foreground">{t('local.title')}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
        {formatTokenCount(summary.usage.totalTokens)}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {summary.providers.map(provider => (
          <div key={provider.providerKind} className="rounded-lg bg-muted/50 px-3 py-2 ring-1 ring-foreground/6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {provider.providerKind === 'codex' ? 'Codex' : 'Claude Agent'}
              </span>
              <span className="text-sm tabular-nums text-foreground">
                {formatTokenCount(provider.usage.totalTokens)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {provider.status === 'available'
                ? t('local.sessions', { count: provider.sessionCount })
                : t(provider.status === 'error' ? 'local.providerError' : 'local.providerUnavailable')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
