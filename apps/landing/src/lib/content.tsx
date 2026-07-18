/**
 * Shared helpers for markdown-driven content (changelog + blog).
 *
 * Both surfaces load an index.json + per-locale .md files from /public,
 * pick the visitor's locale with a zh fallback, and render the body via
 * `marked` inside the shared `.prose` scope (see styles.css).
 */

import { marked } from 'marked'
import { useMemo } from 'react'

marked.setOptions({ gfm: true, breaks: false })

export function resolveLocale(): string {
  const lang = navigator.language || 'zh'
  const short = lang.split('-')[0].toLowerCase()
  return short === 'en' ? 'en' : 'zh'
}

/** Pick the best available locale for a localized record. */
export function pickLocale(languages: string[], locale = resolveLocale()): string {
  if (languages.includes(locale)) { return locale }
  if (languages.includes('zh')) { return 'zh' }
  return languages[0]
}

export function parseFrontmatter(content: string): { meta: Record<string, string>, body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!match) { return { meta: {}, body: content } }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }
  return { meta, body: match[2].trim() }
}

export function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function MarkdownBody({ body }: { body: string }) {
  const html = useMemo(() => marked.parse(body) as string, [body])
  return (
    <div
      className="prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
