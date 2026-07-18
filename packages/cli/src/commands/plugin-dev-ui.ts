import pc from 'picocolors'

import cliPackage from '../../package.json'

const gradientFrom: readonly [number, number, number] = [56, 189, 248]
const gradientTo: readonly [number, number, number] = [167, 139, 250]

const layerColors: Record<string, (text: string) => string> = {
  server: pc.green,
  web: pc.cyan,
  desktop: pc.magenta,
}

function supportsTrueColor(): boolean {
  if (!process.stdout.isTTY) { return false }
  if (process.env.COLORTERM === 'truecolor' || process.env.COLORTERM === '24bit') { return true }
  return typeof process.stdout.getColorDepth === 'function' && process.stdout.getColorDepth() >= 24
}

function gradientText(text: string): string {
  if (!pc.isColorSupported) { return text }
  if (!supportsTrueColor()) { return pc.bold(pc.cyan(text)) }
  const last = Math.max(1, text.length - 1)
  const rendered = [...text].map((char, index) => {
    const ratio = index / last
    const r = Math.round(gradientFrom[0] + (gradientTo[0] - gradientFrom[0]) * ratio)
    const g = Math.round(gradientFrom[1] + (gradientTo[1] - gradientFrom[1]) * ratio)
    const b = Math.round(gradientFrom[2] + (gradientTo[2] - gradientFrom[2]) * ratio)
    return `\x1b[38;2;${r};${g};${b}m${char}`
  }).join('')
  return `\x1b[1m${rendered}\x1b[0m`
}

export function printPluginDevBanner(): void {
  console.log(`\n  ◆ ${gradientText('Cradle')} ${pc.dim(`v${cliPackage.version} · plugin dev`)}\n`)
}

export function formatLayerLabel(layer: string): string {
  const color = layerColors[layer] ?? pc.white
  return pc.bold(color(layer))
}

export function formatDurationMs(durationMs: number): string {
  const rounded = Math.round(durationMs)
  if (rounded < 1000) { return `${rounded}ms` }
  return `${(durationMs / 1000).toFixed(2)}s`
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-GB', { hour12: false })
}

export interface DevSessionSummary {
  serverUrl: string
  layers: Array<{ layer: string, revision: number }>
  outputDir: string
}

export function renderSessionSummary(summary: DevSessionSummary): string {
  const rows: Array<readonly [string, string]> = [
    ['Server', pc.cyan(summary.serverUrl)],
    [
      'Layers',
      summary.layers
        .map(({ layer, revision }) => `${formatLayerLabel(layer)} ${pc.dim(`rev ${revision}`)}`)
        .join(pc.dim(' · ')),
    ],
    ['Output', pc.dim(summary.outputDir)],
  ]
  const width = Math.max(...rows.map(([key]) => key.length))
  return rows.map(([key, value]) => `${pc.dim(key.padEnd(width))}  ${value}`).join('\n')
}
