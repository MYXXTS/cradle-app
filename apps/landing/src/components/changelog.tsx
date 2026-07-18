/**
 * Changelog — a quiet, readable release log.
 *
 * Single centered column. Each release is a row: date + version in a narrow
 * meta column on the left, the markdown body on the right. No rails, no
 * scroll-spy, no framed cards — just well-set type and generous whitespace.
 *
 * Data is loaded at runtime from /changelog/index.json + individual .md files.
 */

import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { formatDate, MarkdownBody, parseFrontmatter, resolveLocale } from '../lib/content'

/* ─── Types ───────────────────────────────────────────────────── */

interface ChangelogIndexEntry {
  version: string
  date: string
  title: Record<string, string>
  languages: string[]
}

interface Release {
  version: string
  date: string
  body: string
  latest?: boolean
}

/* ─── Data fetching ───────────────────────────────────────────── */

function useChangelogData() {
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const indexRes = await fetch('/changelog/index.json')
        if (!indexRes.ok) { throw new Error('Failed to fetch changelog index') }
        const index = await indexRes.json() as ChangelogIndexEntry[]

        const locale = resolveLocale()

        const loaded: Release[] = await Promise.all(
          index.map(async (entry, i) => {
            const lang = entry.languages.includes(locale)
              ? locale
              : entry.languages.includes('zh') ? 'zh' : entry.languages[0]
            const res = await fetch(`/changelog/${entry.version}.${lang}.md`)
            if (!res.ok) { throw new Error(`Failed to fetch ${entry.version}.${lang}.md`) }
            const { body } = parseFrontmatter(await res.text())
            return {
              version: entry.version,
              date: entry.date,
              body,
              latest: i === 0,
            }
          }),
        )

        if (!cancelled) {
          setReleases(loaded)
          setLoading(false)
        }
      }
      catch (err) {
        console.error('Failed to load changelog:', err)
        if (!cancelled) { setLoading(false) }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  return { releases, loading }
}

/* ─── Release row ─────────────────────────────────────────────── */

function ReleaseRow({ release }: { release: Release }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="release-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '148px 1fr',
        gap: '8px 40px',
        padding: '40px 0',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 3 }}>
        <time
          dateTime={release.date}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}
        >
          {formatDate(release.date)}
        </time>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            letterSpacing: '-0.02em',
            wordBreak: 'break-all',
          }}
        >
          v
          {release.version}
        </span>
        {release.latest && (
          <span
            style={{
              alignSelf: 'flex-start',
              marginTop: 2,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text)',
              border: '1px solid var(--border-strong)',
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            Latest
          </span>
        )}
      </div>

      <MarkdownBody body={release.body} />
    </motion.article>
  )
}

/* ─── Page ─────────────────────────────────────────────────────── */

export function ChangelogPage() {
  const { releases, loading } = useChangelogData()

  return (
    <main>
      <section
        style={{
          padding: 'clamp(120px, 18dvh, 180px) 24px clamp(40px, 6dvh, 64px)',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 14,
              }}
            >
              Changelog
            </div>
            <h1
              style={{
                fontSize: 'clamp(2rem, 5vw, 3rem)',
                fontWeight: 650,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--text)',
                marginBottom: 14,
              }}
            >
              What’s new
            </h1>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                maxWidth: 420,
              }}
            >
              Every change to Cradle, in the order it shipped.
            </p>
          </motion.div>
        </div>
      </section>

      <section style={{ padding: '0 24px 120px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {loading
            ? (
                <div
                  style={{
                    padding: '48px 0',
                    borderTop: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  Loading changelog…
                </div>
              )
            : releases.map(r => <ReleaseRow key={r.version} release={r} />)}
        </div>
      </section>
    </main>
  )
}
