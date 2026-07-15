import { useTranslation } from 'react-i18next'

import { formatTokenCount } from '~/lib/number-format'

import type { ChatRuntimeCompactUiSlotState } from '../capabilities/chat-capabilities'

export const SessionProcessedUsage = ({
  compactState,
}: {
  compactState: ChatRuntimeCompactUiSlotState
}) => {
  const { t } = useTranslation('chat')
  if (compactState.treeTotal.totalTokens <= 0) {
    return null
  }

  return (
    <div className="rounded-lg bg-muted/50 px-2.5 py-2 ring-1 ring-foreground/6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-text-tertiary">{t('context.sessionProcessed')}</span>
        <span className="text-[13px] font-medium tabular-nums text-foreground">
          {formatTokenCount(compactState.treeTotal.totalTokens)}
        </span>
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-text-secondary">
        {t('context.mainThread')}
        {' '}
        {formatTokenCount(compactState.total.totalTokens)}
        {compactState.subagentCount > 0
          ? ` · ${t('context.subagentsProcessed', {
              count: compactState.subagentCount,
              tokens: formatTokenCount(compactState.subagentTotal.totalTokens),
            })}`
          : ''}
      </p>
    </div>
  )
}
