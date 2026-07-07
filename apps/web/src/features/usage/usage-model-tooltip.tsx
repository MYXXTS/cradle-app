// Shared "which model" breakdown rows for tooltips — the heatmap's per-day
// bubble and the by-weekday pattern chart both group the exact same
// daily-by-model series differently (by date vs. by weekday), so the row
// rendering is identical; only the surrounding tooltip chrome differs
// (Radix's dark bubble vs. recharts' light card), hence the `tone` prop.
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { formatTokenCount } from '~/lib/number-format'

import type { ModelTokenShare } from './usage-insights'
import { OTHER_MODEL_KEY } from './usage-insights'
import { categoryColor } from './usage-palette'

const TONE_CLASSES = {
  inverted: { border: 'border-background/15', label: 'text-background/70', value: 'text-background' },
  default: { border: 'border-border/50', label: 'text-muted-foreground', value: 'text-foreground' },
} as const

export function ModelShareRows({ shares, tone = 'default' }: { shares: ModelTokenShare[], tone?: keyof typeof TONE_CLASSES }) {
  const { t } = useTranslation('usage')
  if (shares.length === 0) {
    return null
  }
  const classes = TONE_CLASSES[tone]

  return (
    <div className={`mt-1.5 space-y-0.5 border-t pt-1.5 ${classes.border}`}>
      {shares.map((share, index) => (
        <div key={share.modelId} className="flex items-center justify-between gap-3">
          <span className={`flex min-w-0 items-center gap-1.5 ${classes.label}`}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: modelDotColor(share.modelId, index) }} />
            <span className="min-w-0 truncate font-mono">{modelDisplayLabel(share.modelId, t)}</span>
          </span>
          <span className={`shrink-0 tabular-nums ${classes.value}`}>{formatTokenCount(share.totalTokens)}</span>
        </div>
      ))}
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
