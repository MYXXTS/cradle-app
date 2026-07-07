// "When are you most active" section. The day-of-week chart is computed from
// daily rows; the hour-of-day chart uses the server-side usage_logs timestamp
// aggregation.
import type { TFunction } from 'i18next'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, Cell, XAxis } from 'recharts'

import type { ChartConfig } from '~/components/ui/chart'
import { ChartContainer, ChartTooltip } from '~/components/ui/chart'
import { cn } from '~/lib/cn'
import { formatPercentFromRatio, formatTokenCount } from '~/lib/number-format'

import type { ModelTokenShare } from './usage-insights'
import { modelBreakdownByWeekday, weekdayBreakdown, weekdayLabel } from './usage-insights'
import { ModelShareRows, TOOLTIP_CARD_CLASS } from './usage-model-tooltip'
import type { DailyUsage, DailyUsageByModel, HourlyUsage } from './use-usage-overview'

interface UsagePatternsProps {
  daily: DailyUsage[]
  dailyByModel: DailyUsageByModel[]
  hourly: HourlyUsage[]
}

const WEEKDAY_CHART_CONFIG = { tokens: { label: 'Tokens', color: '#3b82f6' } } satisfies ChartConfig
const HOUR_CHART_CONFIG = { tokens: { label: 'Tokens', color: '#0f766e' } } satisfies ChartConfig

export function UsagePatterns({ daily, dailyByModel, hourly }: UsagePatternsProps) {
  const { t } = useTranslation('usage')

  const modelSharesByWeekday = useMemo(() => modelBreakdownByWeekday(dailyByModel), [dailyByModel])

  const weekdayData = useMemo(() => {
    const breakdown = weekdayBreakdown(daily)
    const maxTokens = Math.max(...breakdown.map(entry => entry.totalTokens), 1)
    return breakdown.map(entry => ({
      label: t(`patterns.weekdayShort.${weekdayLabel(entry.weekdayIndex)}`),
      weekdayIndex: entry.weekdayIndex,
      tokens: entry.totalTokens,
      isPeak: entry.totalTokens === maxTokens && entry.totalTokens > 0,
    }))
  }, [daily, t])

  const hourData = useMemo(() => {
    const maxTokens = Math.max(1, ...hourly.map(entry => entry.totalTokens))
    return hourly.map(entry => ({
      label: String(entry.hour),
      hour: entry.hour,
      tokens: entry.totalTokens,
      isPeak: entry.totalTokens === maxTokens && entry.totalTokens > 0,
    }))
  }, [hourly])

  if (weekdayData.every(entry => entry.tokens === 0)) {
    return null
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-sky-500" />
        <h2 className="text-sm font-semibold text-foreground">{t('patterns.title')}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('patterns.description')}</p>

      <div className="mt-4 grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">{t('patterns.byWeekday')}</p>
          <ChartContainer config={WEEKDAY_CHART_CONFIG} className="mt-2 aspect-auto h-[140px] w-full">
            <BarChart data={weekdayData} margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barCategoryGap="24%">
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'currentColor', fillOpacity: 0.55 }} />
              <ChartTooltip
                cursor={{ fill: 'currentColor', fillOpacity: 0.04 }}
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ zIndex: 50 }}
                content={({ active, payload }) => renderWeekdayTooltip(active, payload, modelSharesByWeekday, t)}
              />
              <Bar dataKey="tokens" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {weekdayData.map(entry => (
                  <Cell key={entry.label} fill={entry.isPeak ? '#3b82f6' : 'color-mix(in oklch, #3b82f6 30%, transparent)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          {/* Horizontal share bars beneath the vertical chart — easier to read
              exact "who's bigger by how much" than comparing bar heights, and
              they label each weekday with its % of total volume. */}
          <PatternProgressList
            data={weekdayData}
            labelClassName="w-6"
            peakClassName="bg-blue-500"
            restClassName="bg-blue-500/40"
          />
        </div>

        <div>
          <p className="text-[11px] font-medium text-muted-foreground">{t('patterns.byHour')}</p>
          <ChartContainer config={HOUR_CHART_CONFIG} className="mt-2 aspect-auto h-[140px] w-full">
            <BarChart data={hourData} margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barCategoryGap="18%">
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={3}
                tick={{ fontSize: 10, fill: 'currentColor', fillOpacity: 0.55 }}
              />
              <ChartTooltip
                cursor={{ fill: 'currentColor', fillOpacity: 0.04 }}
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ zIndex: 50 }}
                content={({ active, payload }) => renderPatternTooltip(active, payload)}
              />
              <Bar dataKey="tokens" radius={[3, 3, 0, 0]} maxBarSize={10}>
                {hourData.map(entry => (
                  <Cell key={entry.label} fill={entry.isPeak ? '#0f766e' : 'color-mix(in oklch, #0f766e 30%, transparent)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          {/* The 24-bar hour chart is too dense to compare by eye, so call out
              the busiest 3 hours as ranked share bars underneath. */}
          <div className="mt-3">
            <p className="text-[10px] font-medium text-muted-foreground">{t('patterns.topHours')}</p>
            <PatternProgressList
              data={hourData}
              limit={3}
              labelClassName="w-10"
              peakClassName="bg-teal-700"
              restClassName="bg-teal-700/35"
              formatLabel={entry => `${entry.label.padStart(2, '0')}:00`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function renderPatternTooltip(active: boolean | undefined, payload: ReadonlyArray<{ value?: unknown, payload?: { label: string } }> | undefined) {
  if (!active || !payload?.[0]) {
    return null
  }
  const tokens = typeof payload[0].value === 'number' ? payload[0].value : Number(payload[0].value ?? 0)
  const label = payload[0].payload?.label ?? ''
  const hourLabel = label ? `${label.padStart(2, '0')}:00` : ''
  return (
    <div className={cn(TOOLTIP_CARD_CLASS, 'min-w-40')}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-white">{hourLabel}</p>
        <p className="tabular-nums text-[11px] text-white/70">{formatTokenCount(tokens)}</p>
      </div>
    </div>
  )
}

// The by-weekday chart is backed by per-day model rows, so its tooltip can
// show a real "which model" line.
function renderWeekdayTooltip(
  active: boolean | undefined,
  payload: ReadonlyArray<{ value?: unknown, payload?: { weekdayIndex: number } }> | undefined,
  modelSharesByWeekday: Map<number, ModelTokenShare[]>,
  t: TFunction<'usage'>,
) {
  if (!active || !payload?.[0]) {
    return null
  }
  const tokens = typeof payload[0].value === 'number' ? payload[0].value : Number(payload[0].value ?? 0)
  const weekdayIndex = payload[0].payload?.weekdayIndex
  const weekdayName = weekdayIndex !== undefined ? t(`patterns.weekdayFull.${weekdayLabel(weekdayIndex)}`) : ''
  const shares = weekdayIndex !== undefined ? modelSharesByWeekday.get(weekdayIndex) ?? [] : []
  return (
    <div className={cn(TOOLTIP_CARD_CLASS, 'min-w-52')}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-white">{weekdayName}</p>
        <p className="tabular-nums text-[11px] text-white/70">{formatTokenCount(tokens)}</p>
      </div>
      <ModelShareRows shares={shares} tone="default" />
    </div>
  )
}

interface PatternProgressEntry {
  label: string
  tokens: number
  isPeak: boolean
}

// Ranked horizontal share bars rendered beneath a pattern chart. Bar width is
// relative to the max entry (so the tallest always fills the track and the
// rest scale against it), while the trailing number is that entry's % of the
// grand total — two different reads ("how close to the peak" vs "share of
// all volume") from one compact row.
function PatternProgressList({
  data,
  formatLabel,
  limit,
  peakClassName,
  restClassName,
  labelClassName,
}: {
  data: PatternProgressEntry[]
  formatLabel?: (entry: PatternProgressEntry) => string
  limit?: number
  peakClassName: string
  restClassName: string
  labelClassName?: string
}) {
  const sorted = limit ? [...data].sort((a, b) => b.tokens - a.tokens).slice(0, limit) : data
  const max = Math.max(...sorted.map(entry => entry.tokens), 1)
  const total = data.reduce((sum, entry) => sum + entry.tokens, 0)
  return (
    <div className="mt-3 space-y-1.5">
      {sorted.map(entry => (
        <div key={entry.label} className="flex items-center gap-2.5">
          <span className={cn('shrink-0 text-[10px] tabular-nums text-muted-foreground', labelClassName)}>
            {formatLabel ? formatLabel(entry) : entry.label}
          </span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/6">
            <div
              className={cn('size-full rounded-full transition-[width] duration-500', entry.isPeak ? peakClassName : restClassName)}
              style={{ width: `${(entry.tokens / max) * 100}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
            {total > 0 ? formatPercentFromRatio(entry.tokens / total) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}
