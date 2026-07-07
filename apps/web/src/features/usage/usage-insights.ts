// Pure calculations that turn the raw daily series into the comparisons and
// call-outs the dashboard surfaces ("+23% vs last week", "busiest on
// Tuesdays"). Everything here is derived from real API data — no mocking.
import { buildDenseDailySeries, weekdayIndexFromDateKey } from './usage-date'
import type { DailyCost, DailyUsage, DailyUsageByModel } from './use-usage-overview'

export { weekdayLabel } from './usage-date'

export interface PeriodComparison {
  currentTotal: number
  previousTotal: number
  /** null when the previous period has no data to compare against */
  changePct: number | null
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/**
 * Compares the trailing `days` window against the window immediately before
 * it (e.g. last 7 days vs the 7 days before that). `values` must be a dense,
 * chronologically-ordered series with no date gaps.
 */
export function comparePeriods(values: number[], days: number): PeriodComparison {
  const current = values.slice(-days)
  const previous = values.slice(-days * 2, -days)
  const currentTotal = sum(current)
  const previousTotal = sum(previous)
  const changePct = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null
  return { currentTotal, previousTotal, changePct }
}

export function denseTokenSeries(daily: DailyUsage[], days: number): DailyUsage[] {
  return buildDenseDailySeries(daily, days, date => ({
    date,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    count: 0,
  }))
}

export function denseCostSeries(dailyCost: DailyCost[], days: number): DailyCost[] {
  return buildDenseDailySeries(dailyCost, days, date => ({
    date,
    costUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    stepCount: 0,
  }))
}

export interface WeekdayInsight {
  weekdayIndex: number
  totalTokens: number
  share: number
}

/** Which day of the week this user is most active on, across up to a year of history. */
export function mostActiveWeekday(daily: DailyUsage[]): WeekdayInsight | null {
  const breakdown = weekdayBreakdown(daily)
  const top = breakdown.reduce((best, entry) => (entry.totalTokens > best.totalTokens ? entry : best), breakdown[0])
  return top && top.totalTokens > 0 ? top : null
}

/** Real per-weekday totals across the full history, oldest data included. */
export function weekdayBreakdown(daily: DailyUsage[]): WeekdayInsight[] {
  const totalsByWeekday: number[] = Array.from<number>({ length: 7 }).fill(0)
  let grandTotal = 0
  for (const day of daily) {
    const weekdayIndex = weekdayIndexFromDateKey(day.date)
    totalsByWeekday[weekdayIndex] += day.totalTokens
    grandTotal += day.totalTokens
  }
  return totalsByWeekday.map((totalTokens, weekdayIndex) => ({
    weekdayIndex,
    totalTokens,
    share: grandTotal > 0 ? totalTokens / grandTotal : 0,
  }))
}

export interface ModelTokenShare {
  modelId: string
  totalTokens: number
}

/** Synthetic key for the collapsed "everything past the top N" bucket — never a real model id. */
export const OTHER_MODEL_KEY = '__other__'

/** Collapses per-model totals to the top `limit` entries plus one "other" bucket for the remainder, so a workspace that has cycled through a dozen models still renders a readable tooltip. */
function topModelShares(entries: ModelTokenShare[], limit: number): ModelTokenShare[] {
  const sorted = [...entries].sort((a, b) => b.totalTokens - a.totalTokens)
  if (sorted.length <= limit) {
    return sorted
  }
  const top = sorted.slice(0, limit)
  const otherTokens = sum(sorted.slice(limit).map(entry => entry.totalTokens))
  return otherTokens > 0 ? [...top, { modelId: OTHER_MODEL_KEY, totalTokens: otherTokens }] : top
}

/** Groups the daily-by-model series by date, for the "which model" line in heatmap day tooltips. */
export function modelBreakdownByDate(dailyByModel: DailyUsageByModel[], limit = 4): Map<string, ModelTokenShare[]> {
  const grouped = new Map<string, ModelTokenShare[]>()
  for (const row of dailyByModel) {
    const entries = grouped.get(row.date) ?? []
    entries.push({ modelId: row.modelId, totalTokens: row.totalTokens })
    grouped.set(row.date, entries)
  }
  for (const [date, entries] of grouped) {
    grouped.set(date, topModelShares(entries, limit))
  }
  return grouped
}

/** Groups the daily-by-model series by weekday, for the "which model" line in the by-weekday pattern chart tooltip. */
export function modelBreakdownByWeekday(dailyByModel: DailyUsageByModel[], limit = 4): Map<number, ModelTokenShare[]> {
  const totalsByWeekday = new Map<number, Map<string, number>>()
  for (const row of dailyByModel) {
    const weekdayIndex = weekdayIndexFromDateKey(row.date)
    const totals = totalsByWeekday.get(weekdayIndex) ?? new Map<string, number>()
    totals.set(row.modelId, (totals.get(row.modelId) ?? 0) + row.totalTokens)
    totalsByWeekday.set(weekdayIndex, totals)
  }
  const result = new Map<number, ModelTokenShare[]>()
  for (const [weekdayIndex, totals] of totalsByWeekday) {
    const entries: ModelTokenShare[] = Array.from(totals.entries()).map(([modelId, totalTokens]) => ({ modelId, totalTokens }))
    result.set(weekdayIndex, topModelShares(entries, limit))
  }
  return result
}

// ── Trend breakdown ────────────────────────────────────────────────────────
// The trend chart already stacks prompt/completion as areas, but "by how
// much, and when's the peak" needs numbers. These derive per-part totals,
// averages, and the peak day straight from the dense daily series — no new
// backend field, just a different slice of the same daily rows the chart
// already renders.

export interface TokenPartStats {
  total: number
  /**
   * Mean over days that actually had activity (not over the whole range —
   *  dividing by `days` would dilute the average with zero-activity days).
   */
  avgPerActiveDay: number
  peak: { date: string, value: number } | null
  /** Share of this part vs the combined prompt+completion total. */
  share: number
}

export interface TrendTokenBreakdown {
  prompt: TokenPartStats
  completion: TokenPartStats
  total: number
  activeDays: number
  /** Completion ÷ (prompt + completion). How much of the volume was output. */
  outputRatio: number
  /** The single day with the most combined prompt+completion tokens. */
  totalPeak: { date: string, value: number } | null
}

export function trendTokenBreakdown(daily: DailyUsage[], days: number): TrendTokenBreakdown {
  const series = denseTokenSeries(daily, days)
  let promptTotal = 0
  let completionTotal = 0
  let activeDays = 0
  let promptPeak: { date: string, value: number } | null = null
  let completionPeak: { date: string, value: number } | null = null
  let totalPeak: { date: string, value: number } | null = null

  for (const day of series) {
    promptTotal += day.promptTokens
    completionTotal += day.completionTokens
    if (day.totalTokens > 0) {
      activeDays += 1
    }
    if (!promptPeak || day.promptTokens > promptPeak.value) {
      promptPeak = { date: day.date, value: day.promptTokens }
    }
    if (!completionPeak || day.completionTokens > completionPeak.value) {
      completionPeak = { date: day.date, value: day.completionTokens }
    }
    if (!totalPeak || day.totalTokens > totalPeak.value) {
      totalPeak = { date: day.date, value: day.totalTokens }
    }
  }

  const total = promptTotal + completionTotal
  const safeAvg = (sum: number) => (activeDays > 0 ? sum / activeDays : 0)
  const peakOr = (peak: { date: string, value: number } | null) => (peak && peak.value > 0 ? peak : null)

  return {
    prompt: {
      total: promptTotal,
      avgPerActiveDay: safeAvg(promptTotal),
      peak: peakOr(promptPeak),
      share: total > 0 ? promptTotal / total : 0,
    },
    completion: {
      total: completionTotal,
      avgPerActiveDay: safeAvg(completionTotal),
      peak: peakOr(completionPeak),
      share: total > 0 ? completionTotal / total : 0,
    },
    total,
    activeDays,
    outputRatio: total > 0 ? completionTotal / total : 0,
    totalPeak: peakOr(totalPeak),
  }
}
