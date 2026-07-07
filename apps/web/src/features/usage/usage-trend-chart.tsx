// Hero trend chart — replaces the old hand-rolled SVG sparklines with a real
// interactive recharts area chart (crosshair tooltip, gradient fills, a
// tokens/cost toggle), following the same ChartContainer pattern already
// used in features/agent-management/codex-account-diagnostics-panel.tsx.
import { DownSmallLine } from '@mingcute/react'
import { format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'

import type { ChartConfig } from '~/components/ui/chart'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '~/components/ui/chart'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group'
import { cn } from '~/lib/cn'
import { formatPercentFromRatio, formatTokenCount, formatUsd } from '~/lib/number-format'

import type { TrendTokenBreakdown } from './usage-insights'
import { denseCostSeries, denseTokenSeries, trendTokenBreakdown } from './usage-insights'
import type { UsageRangeKey } from './usage-time-range'
import { rangeDays } from './usage-time-range'
import type { DailyCost, DailyUsage } from './use-usage-overview'

type TrendMetric = 'tokens' | 'cost'

interface UsageTrendChartProps {
  daily: DailyUsage[]
  dailyCost: DailyCost[]
  range: UsageRangeKey
  hasCost: boolean
}

// Prompt/completion are two shades of the *same* hue (not blue+violet) so
// the split reads as "one metric, two parts" rather than two unrelated
// series — matches the hero cards' blue = volume convention.
const TOKENS_CHART_CONFIG = {
  promptTokens: { label: 'Prompt', color: '#3b82f6' },
  completionTokens: { label: 'Completion', color: '#93c5fd' },
} satisfies ChartConfig

const COST_CHART_CONFIG = {
  costUsd: { label: 'Cost', color: '#10b981' },
} satisfies ChartConfig

export function UsageTrendChart({ daily, dailyCost, range, hasCost }: UsageTrendChartProps) {
  const { t } = useTranslation('usage')
  const [metric, setMetric] = useState<TrendMetric>('tokens')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const days = rangeDays(range)
  const activeMetric = hasCost ? metric : 'tokens'

  const tokenData = useMemo(() => denseTokenSeries(daily, days), [daily, days])
  const costData = useMemo(() => denseCostSeries(dailyCost, days), [dailyCost, days])
  // Prompt/completion split for the expandable details panel — only the
  // tokens metric has a meaningful split to break out, so this stays computed
  // regardless but only rendered when viewing tokens.
  const breakdown = useMemo(() => trendTokenBreakdown(daily, days), [daily, days])

  const tickFormatter = (dateKey: string) => format(parseISO(dateKey), days > 90 ? 'MMM' : 'MMM d')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-blue-500" />
            <h2 className="text-sm font-semibold text-foreground">{t('trend.title')}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('trend.description')}</p>
        </div>
        {hasCost && (
          <ToggleGroup
            type="single"
            value={activeMetric}
            onValueChange={(value) => {
              if (value === 'tokens' || value === 'cost') {
                setMetric(value)
              }
            }}
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-px rounded-md"
          >
            <ToggleGroupItem value="tokens" className="h-7 px-2.5 text-xs">{t('trend.toggleTokens')}</ToggleGroupItem>
            <ToggleGroupItem value="cost" className="h-7 px-2.5 text-xs">{t('trend.toggleCost')}</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      <div className="mt-4">
        {activeMetric === 'tokens'
          ? (
            <ChartContainer config={TOKENS_CHART_CONFIG} className="aspect-auto h-[220px] w-full">
              <AreaChart data={tokenData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="usage-trend-prompt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="usage-trend-completion" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#93c5fd" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.06} strokeDasharray="2 4" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={36}
                  tick={{ fontSize: 10, fill: 'currentColor', fillOpacity: 0.55 }}
                  tickFormatter={tickFormatter}
                />
                <ChartTooltip
                  cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }}
                  content={(
                    <ChartTooltipContent
                      labelFormatter={value => format(parseISO(String(value)), 'PP')}
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: name === 'promptTokens' ? '#3b82f6' : '#93c5fd' }}
                            />
                            {name === 'promptTokens' ? t('trend.prompt') : t('trend.completion')}
                          </span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatTokenCount(typeof value === 'number' ? value : Number(value ?? 0))}
                          </span>
                        </div>
                      )}
                    />
                  )}
                />
                <Area type="monotone" dataKey="promptTokens" stackId="tokens" stroke="#3b82f6" strokeWidth={1.5} fill="url(#usage-trend-prompt)" />
                <Area type="monotone" dataKey="completionTokens" stackId="tokens" stroke="#93c5fd" strokeWidth={1.5} fill="url(#usage-trend-completion)" />
              </AreaChart>
            </ChartContainer>
          )
          : (
            <ChartContainer config={COST_CHART_CONFIG} className="aspect-auto h-[220px] w-full">
              <AreaChart data={costData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="usage-trend-cost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.06} strokeDasharray="2 4" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={36}
                  tick={{ fontSize: 10, fill: 'currentColor', fillOpacity: 0.55 }}
                  tickFormatter={tickFormatter}
                />
                <ChartTooltip
                  cursor={{ stroke: 'currentColor', strokeOpacity: 0.15 }}
                  content={(
                    <ChartTooltipContent
                      hideLabel={false}
                      labelFormatter={value => format(parseISO(String(value)), 'PP')}
                      formatter={value => (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            {t('trend.cost')}
                          </span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatUsd(typeof value === 'number' ? value : Number(value ?? 0))}
                          </span>
                        </div>
                      )}
                    />
                  )}
                />
                <Area type="monotone" dataKey="costUsd" stroke="#10b981" strokeWidth={1.5} fill="url(#usage-trend-cost)" />
              </AreaChart>
            </ChartContainer>
          )}
      </div>

      {activeMetric === 'tokens' && (
        <TrendBreakdownDetails breakdown={breakdown} open={detailsOpen} onOpenChange={setDetailsOpen} />
      )}
    </div>
  )
}

// Expandable drill-down beneath the trend chart. The stacked area already
// shows prompt vs completion *shape* over time; this surfaces the numbers a
// user scanning "how much is input vs output, and when did it spike" actually
// wants — share, averages, and the peak day — without cluttering the
// always-visible chart area.
function TrendBreakdownDetails({ breakdown, open, onOpenChange }: {
  breakdown: TrendTokenBreakdown
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('usage')
  const avgPerActiveDay = breakdown.activeDays > 0 ? breakdown.total / breakdown.activeDays : 0

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="mt-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-testid="usage-trend-details-toggle"
          className="group flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <DownSmallLine className={cn('!size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200', !open && '-rotate-90')} />
          {open ? t('trend.hideDetails') : t('trend.showDetails')}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200">
        <div className="mt-3 rounded-xl bg-foreground/[0.02] p-3 ring-1 ring-foreground/6">
          <div className="space-y-2">
            <ShareBar label={t('trend.prompt')} color="#3b82f6" share={breakdown.prompt.share} total={breakdown.prompt.total} />
            <ShareBar label={t('trend.completion')} color="#93c5fd" share={breakdown.completion.share} total={breakdown.completion.total} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-foreground/6 pt-3 sm:grid-cols-4">
            <StatCell label={t('trend.avgPerDay')} value={formatTokenCount(avgPerActiveDay)} />
            <StatCell label={t('trend.activeDays')} value={String(breakdown.activeDays)} />
            <StatCell label={t('trend.outputRatio')} value={formatPercentFromRatio(breakdown.outputRatio)} />
            <StatCell
              label={t('trend.peak')}
              value={breakdown.totalPeak
                ? t('trend.peakValue', {
                    tokens: formatTokenCount(breakdown.totalPeak.value),
                    date: format(parseISO(breakdown.totalPeak.date), 'MMM d'),
                  })
                : '—'}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ShareBar({ label, color, share, total }: { label: string, color: string, share: number, total: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-24 shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{label}</span>
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/8">
        <div
          className="size-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(share * 100, 0)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground">{formatPercentFromRatio(share)}</span>
      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{formatTokenCount(total)}</span>
    </div>
  )
}

function StatCell({ label, value }: { label: string, value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-medium tabular-nums text-foreground">{value}</p>
    </div>
  )
}
