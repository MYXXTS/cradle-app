import { useTranslation } from 'react-i18next'

import { cn } from '~/lib/cn'
import { formatTimeAgo } from '~/lib/format-time'
import { formatTokenCount, formatUsd } from '~/lib/number-format'

import type { RecentUsageSession } from './use-usage-overview'

interface UsageRecentSessionsProps {
  sessions: RecentUsageSession[]
}

export function UsageRecentSessions({ sessions }: UsageRecentSessionsProps) {
  const { t } = useTranslation('usage')
  const now = Date.now()

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-foreground">{t('sessions.title')}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('sessions.description')}</p>

      <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-foreground/6">
        {sessions.map((session, index) => (
          <div
            key={session.sessionId}
            className={cn(
              'flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.03]',
              index < sessions.length - 1 && 'border-b border-foreground/5',
            )}
          >
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/15" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{session.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {session.agentName ?? t('sessions.unknownAgent')}
                {' · '}
                <span className="font-mono">{session.modelId}</span>
                {' · '}
                {formatTimeAgo(session.lastUsageAt, now)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[13px] font-medium tabular-nums text-foreground">{formatUsd(session.costUsd)}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {t('sessions.tokensAndTurns', { tokens: formatTokenCount(session.totalTokens), turns: session.turnCount })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
