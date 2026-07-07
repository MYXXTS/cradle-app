// Shared "which model" breakdown rows for tooltips — the heatmap's per-day
// bubble, the by-weekday pattern chart, and the trend chart's per-day hover
// all group the exact same daily-by-model series differently (by date, by
// weekday, or by the hovered date), so the row rendering is identical; only
// the surrounding tooltip chrome differs (Radix's dark bubble vs. recharts'
// light card), hence the `tone` prop. Each row carries a progress bar + %
// computed from the shares' own total, so "which model dominated this day /
// weekday" is readable at a glance instead of only as raw token counts.
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { formatPercentFromRatio, formatTokenCount } from '~/lib/number-format'

import type { ModelTokenShare } from './usage-insights'
import { OTHER_MODEL_KEY } from './usage-insights'
import { categoryColor } from './usage-palette'

// Shared chrome for Usage dashboard tooltips. Keep this fixed-dark rather
// than semantic "foreground/background" so it does not flip to a white bubble
// in dark mode.
export const TOOLTIP_CARD_CLASS = 'rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-xs text-white shadow-lg shadow-black/20'

const TONE_CLASSES = {
  inverted: { border: 'border-white/10', label: 'text-white/70', value: 'text-white', track: 'bg-white/15' },
  default: { border: 'border-white/10', label: 'text-white/70', value: 'text-white', track: 'bg-white/15' },
} as const

export function ModelShareRows({ shares, tone = 'default' }: { shares: ModelTokenShare[], tone?: keyof typeof TONE_CLASSES }) {
  const { t } = useTranslation('usage')
  if (shares.length === 0) {
    return null
  }
  const classes = TONE_CLASSES[tone]
  const total = shares.reduce((sum, share) => sum + share.totalTokens, 0)

  return (
    <div className={`mt-2 space-y-1.5 border-t pt-2 ${classes.border}`}>
      {shares.map((share, index) => {
        const ratio = total > 0 ? share.totalTokens / total : 0
        const color = modelDotColor(share.modelId, index)
        return (
          <div key={share.modelId} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className={`flex min-w-0 items-center gap-1.5 ${classes.label}`}>
                <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="min-w-0 truncate font-mono text-[11px]">{modelDisplayLabel(share.modelId, t)}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className={`tabular-nums text-[11px] ${classes.value}`}>{formatTokenCount(share.totalTokens)}</span>
                <span className={`w-8 text-right text-[10px] tabular-nums ${classes.label}`}>{formatPercentFromRatio(ratio)}</span>
              </span>
            </div>
            <div className={`h-1 overflow-hidden rounded-full ${classes.track}`}>
              <div className="size-full rounded-full transition-[width] duration-300" style={{ width: `${ratio * 100}%`, backgroundColor: color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function modelDotColor(modelId: string, index: number): string {
  if (modelId === OTHER_MODEL_KEY || modelId === 'unknown') {
    return 'var(--color-muted-foreground)'
  }
  return categoryColor(index)
}

function modelDisplayLabel(modelId: string, t: TFunction<'usage'>): string {
  if (modelId === OTHER_MODEL_KEY) { return t('tooltip.otherModels') }
  if (modelId === 'unknown') { return t('tooltip.unknownModel') }
  return modelId
}
