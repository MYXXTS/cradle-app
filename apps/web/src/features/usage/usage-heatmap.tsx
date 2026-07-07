// GitHub-contributions-style heatmap. The 371 day cells share ONE tooltip
// element driven by hover state, instead of mounting a separate Radix
// Tooltip per cell — with that many trigger/portal pairs stacked edge to
// edge, fast pointer movement across the grid could leave a stale tooltip
// open (Radix's per-root open/close bookkeeping doesn't expect that many
// instances this densely packed). A single positioned bubble that we show
// and move ourselves has no such failure mode and is lighter besides.
import { AnimatePresence, m } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatTokenCount } from '~/lib/number-format'

import { toDateKey } from './usage-date'
import type { ModelTokenShare } from './usage-insights'
import { modelBreakdownByDate, mostActiveWeekday, weekdayLabel } from './usage-insights'
import { ModelShareRows } from './usage-model-tooltip'

interface DailyUsage {
  date: string
  totalTokens: number
  promptTokens: number
  completionTokens: number
  count: number
}

interface DailyUsageByModel {
  date: string
  modelId: string
  totalTokens: number
  count: number
}

interface UsageHeatmapProps {
  data: DailyUsage[]
  dailyByModel?: DailyUsageByModel[]
  days?: number
}

const CELL_SIZE = 13
const CELL_GAP = 3
const CELL_RADIUS = 3.5
const WEEKS = 53
const DAY_LABELS = [
  { key: 'sun', label: '' },
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: '' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: '' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: '' },
]
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface HeatmapCell {
  date: string
  tokens: number
  usage: DailyUsage | null
  future: boolean
}

interface HoveredCell {
  cell: HeatmapCell
  x: number
  y: number
}

function buildGrid(data: DailyUsage[]): {
  weeks: HeatmapCell[][]
  monthLabels: Array<{ label: string, weekIndex: number }>
  maxTokens: number
} {
  const lookup = new Map(data.map(d => [d.date, d]))

  const today = new Date()
  const todayDay = today.getDay()
  const start = new Date(today)
  start.setDate(start.getDate() - (WEEKS - 1) * 7 - todayDay)

  const weeks: HeatmapCell[][] = []
  const monthStarts = new Map<number, number>()
  let maxTokens = 0

  for (let w = 0; w < WEEKS; w++) {
    const week: HeatmapCell[] = []
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(start)
      cellDate.setDate(cellDate.getDate() + w * 7 + d)
      const dateStr = toDateKey(cellDate)

      if (cellDate > today) {
        week.push({ date: dateStr, tokens: 0, usage: null, future: true })
        continue
      }

      const usage = lookup.get(dateStr) ?? null
      const tokens = usage?.totalTokens ?? 0
      if (tokens > maxTokens) { maxTokens = tokens }

      week.push({ date: dateStr, tokens, usage, future: false })

      const month = cellDate.getMonth()
      if (!monthStarts.has(month) || w < monthStarts.get(month)!) {
        monthStarts.set(month, w)
      }
    }
    weeks.push(week)
  }

  const monthLabels = Array.from(monthStarts.entries())
    .sort(([, a], [, b]) => a - b)
    .map(([month, weekIndex]) => ({ label: MONTH_NAMES[month], weekIndex }))

  return { weeks, monthLabels, maxTokens }
}

// Blue intensity scale (matches the "tokens = blue" convention used across
// the rest of the redesigned dashboard) instead of the previous grayscale.
function cellColor(intensity: number): string {
  if (intensity === 0) { return 'var(--color-muted-foreground)' }
  const l = 0.82 - intensity * 0.32
  const c = 0.06 + intensity * 0.16
  return `oklch(${l} ${c} 255)`
}

function UsageHeatmapInner({ data, dailyByModel = [] }: UsageHeatmapProps) {
  const { t } = useTranslation('usage')
  const { weeks, monthLabels, maxTokens } = buildGrid(data)
  const topWeekday = mostActiveWeekday(data)
  const modelSharesByDate = useMemo(() => modelBreakdownByDate(dailyByModel), [dailyByModel])

  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<HoveredCell | null>(null)

  const cellStep = CELL_SIZE + CELL_GAP
  const leftPad = 32
  const topPad = 20

  function handleCellEnter(cell: HeatmapCell, event: React.MouseEvent<HTMLDivElement>) {
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) { return }
    const targetRect = event.currentTarget.getBoundingClientRect()
    setHovered({
      cell,
      x: targetRect.left - containerRect.left + targetRect.width / 2,
      y: targetRect.top - containerRect.top,
    })
  }

  return (
    <div
      ref={containerRef}
      data-testid="usage-heatmap"
      className="relative mx-auto w-fit"
      onMouseLeave={() => setHovered(null)}
    >
      {/* Month labels row */}
      <div className="relative mb-0.5" style={{ height: topPad, marginLeft: leftPad }}>
        {monthLabels.map(({ label, weekIndex }) => (
          <span
            key={`${label}-${weekIndex}`}
            className="absolute text-[10px] text-muted-foreground/50"
            style={{ left: weekIndex * cellStep }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Grid + day labels */}
      <div className="flex gap-0">
        {/* Day labels column */}
        <div className="flex flex-col" style={{ width: leftPad, gap: CELL_GAP }}>
          {DAY_LABELS.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center text-[10px] text-muted-foreground/40"
              style={{ height: CELL_SIZE }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="flex" style={{ gap: CELL_GAP }}>
          {weeks.map(week => (
            <div key={week[0].date} className="flex flex-col" style={{ gap: CELL_GAP }}>
              {week.map((cell) => {
                if (cell.future) {
                  return <div key={cell.date} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
                }
                const intensity = maxTokens > 0 ? cell.tokens / maxTokens : 0
                return (
                  <div
                    key={cell.date}
                    data-testid="usage-heatmap-cell"
                    data-date={cell.date}
                    data-has-usage={cell.tokens > 0 ? 'true' : 'false'}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      borderRadius: CELL_RADIUS,
                      backgroundColor: cellColor(intensity),
                      opacity: intensity === 0 ? 0.08 : 1,
                    }}
                    className="cursor-default transition-[opacity,transform] duration-150 hover:scale-110 hover:opacity-100 hover:ring-1 hover:ring-foreground/60"
                    onMouseEnter={event => handleCellEnter(cell, event)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {hovered && (
          <HeatmapTooltip
            hovered={hovered}
            modelShares={modelSharesByDate.get(hovered.cell.date) ?? []}
          />
        )}
      </AnimatePresence>

      {topWeekday && (
        <p className="mt-3 text-[11px] text-muted-foreground" style={{ marginLeft: leftPad }} data-testid="usage-heatmap-insight">
          {t('heatmap.mostActiveWeekday', {
            weekday: t(`patterns.weekdayFull.${weekdayLabel(topWeekday.weekdayIndex)}`),
            tokens: formatTokenCount(topWeekday.totalTokens),
            percent: Math.round(topWeekday.share * 100),
          })}
        </p>
      )}
    </div>
  )
}

function HeatmapTooltip({ hovered, modelShares }: { hovered: HoveredCell, modelShares: ModelTokenShare[] }) {
  const { t } = useTranslation('usage')
  const { cell } = hovered

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="pointer-events-none absolute z-50 w-fit max-w-64 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md border border-white/10 bg-neutral-950 px-3 py-1.5 text-xs text-white shadow-lg shadow-black/20"
      style={{ left: hovered.x, top: hovered.y }}
      data-testid="usage-heatmap-tooltip"
    >
      <p className="font-medium" data-testid="usage-heatmap-tooltip-date">{cell.date}</p>
      <p className="mt-0.5 text-white/70" data-testid="usage-heatmap-tooltip-metrics">
        {cell.tokens > 0
          ? t('heatmap.tooltipMetrics', { tokens: cell.tokens.toLocaleString(), turns: cell.usage?.count ?? 0 })
          : t('heatmap.tooltipNoUsage')}
      </p>
      <ModelShareRows shares={modelShares} tone="inverted" />
    </m.div>
  )
}

export const UsageHeatmap = UsageHeatmapInner
