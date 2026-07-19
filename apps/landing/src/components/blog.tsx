/**
 * Blog — post index.
 *
 * Editorial layout in the spirit of anthropic.com/news: a large featured
 * story (big cover left, title block right) followed by a three-column grid
 * of quiet cards — cover, title, date, nothing boxed, nothing bordered.
 * Hover is a slow cover zoom and a slight title brightening.
 *
 * Data is loaded at runtime from /blog/index.json.
 */

import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { formatDate, resolveLocale } from '../lib/content'

export interface BlogIndexEntry {
  slug: string
  date: string
  title: Record<string, string>
  description: Record<string, string>
  cover?: string
  author?: string
  tags?: string[]
  languages: string[]
}

export interface BlogPostMeta {
  slug: string
  date: string
  title: string
  description: string
  cover?: string
  author?: string
  tags: string[]
  languages: string[]
}

export function useBlogIndex() {
  const [posts, setPosts] = useState<BlogPostMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/blog/index.json')
        if (!res.ok) { throw new Error('Failed to fetch blog index') }
        const index = await res.json() as BlogIndexEntry[]
        const locale = resolveLocale()
        const loaded: BlogPostMeta[] = index.map(entry => ({
          slug: entry.slug,
          date: entry.date,
          title: entry.title[locale] || entry.title.zh || Object.values(entry.title)[0] || '',
          description: entry.description[locale] || entry.description.zh || Object.values(entry.description)[0] || '',
          cover: entry.cover,
          author: entry.author,
          tags: entry.tags ?? [],
          languages: entry.languages,
        }))
        if (!cancelled) {
          setPosts(loaded)
          setLoading(false)
        }
      }
      catch (err) {
        console.error('Failed to load blog index:', err)
        if (!cancelled) { setLoading(false) }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  return { posts, loading }
}

/* ─── Cover with slow zoom on hover ───────────────────────────── */

function Cover({ src, hovered, ratio, radius }: { src: string, hovered: boolean, ratio: string, radius: number }) {
  return (
    <span
      style={{
        display: 'block',
        overflow: 'hidden',
        borderRadius: radius,
        background: 'var(--bg-subtle)',
        aspectRatio: ratio,
      }}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: hovered ? 'scale(1.03)' : 'none',
          transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </span>
  )
}

/* ─── Tag label ───────────────────────────────────────────────── */

function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '3px 9px',
      }}
    >
      {label}
    </span>
  )
}

/* ─── Tag filter bar ──────────────────────────────────────────── */

function TagFilter({ tags, active, onChange }: { tags: string[], active: string | null, onChange: (t: string | null) => void }) {
  const options: (string | null)[] = [null, ...tags]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 56 }}>
      {options.map((t) => {
        const isActive = t === active
        return (
          <button
            key={t ?? 'all'}
            onClick={() => onChange(t)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              letterSpacing: '0.04em',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              background: isActive ? 'var(--fill-hover)' : 'transparent',
              border: `1px solid ${isActive ? 'var(--border-strong)' : 'var(--border)'}`,
              borderRadius: 999,
              padding: '5px 13px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {t ?? 'All'}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Featured story ──────────────────────────────────────────── */

function Featured({ post }: { post: BlogPostMeta }) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.a
      href={`#/blog/${post.slug}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="blog-featured"
      style={{
        display: 'grid',
        gridTemplateColumns: '7fr 5fr',
        gap: 48,
        alignItems: 'center',
        textDecoration: 'none',
        marginBottom: 88,
      }}
    >
      {post.cover && <Cover src={post.cover} hovered={hovered} ratio="16 / 10" radius={14} />}
      <span style={{ display: 'block', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          {post.tags[0] && <Tag label={post.tags[0]} />}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
            {formatDate(post.date)}
          </span>
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 'clamp(1.5rem, 2.6vw, 2rem)',
            fontWeight: 650,
            lineHeight: 1.2,
            letterSpacing: '-0.03em',
            color: hovered ? 'var(--text)' : 'color-mix(in srgb, var(--text), var(--text-secondary) 10%)',
            marginBottom: 16,
            transition: 'color 0.2s',
          }}
        >
          {post.title}
        </span>
        {post.description && (
          <span
            style={{
              display: 'block',
              fontSize: 15,
              lineHeight: 1.7,
              color: 'var(--text-muted)',
            }}
          >
            {post.description}
          </span>
        )}
      </span>
    </motion.a>
  )
}

/* ─── Grid card ───────────────────────────────────────────────── */

function Card({ post, index }: { post: BlogPostMeta, index: number }) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.a
      href={`#/blog/${post.slug}`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-6% 0px' }}
      transition={{ duration: 0.45, delay: (index % 3) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'block', textDecoration: 'none' }}
    >
      {post.cover && (
        <span style={{ display: 'block', marginBottom: 20 }}>
          <Cover src={post.cover} hovered={hovered} ratio="16 / 10" radius={10} />
        </span>
      )}
      <span
        style={{
          display: 'block',
          fontSize: 15.5,
          fontWeight: 600,
          lineHeight: 1.4,
          letterSpacing: '-0.015em',
          color: hovered ? 'var(--text)' : 'color-mix(in srgb, var(--text), var(--text-secondary) 10%)',
          marginBottom: 8,
          transition: 'color 0.2s',
        }}
      >
        {post.title}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {post.tags[0] && <Tag label={post.tags[0]} />}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
          {formatDate(post.date)}
        </span>
      </span>
    </motion.a>
  )
}

/* ─── Page ─────────────────────────────────────────────────────── */

export function BlogPage() {
  const { posts, loading } = useBlogIndex()
  const [tag, setTag] = useState<string | null>(null)

  const allTags = [...new Set(posts.flatMap(p => p.tags))]
  const filtered = tag ? posts.filter(p => p.tags.includes(tag)) : posts
  const [featured, ...rest] = filtered

  return (
    <main>
      <section
        style={{
          padding: 'clamp(120px, 16dvh, 168px) 24px clamp(56px, 8dvh, 88px)',
        }}
      >
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
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
                marginBottom: 16,
              }}
            >
              Blog
            </div>
            <h1
              style={{
                fontSize: 'clamp(2.2rem, 5vw, 3.2rem)',
                fontWeight: 650,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                color: 'var(--text)',
                marginBottom: 16,
              }}
            >
              Notes from the workshop
            </h1>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                maxWidth: 460,
              }}
            >
              Longer-form writing about what we’re building and why.
            </p>
          </motion.div>
        </div>
      </section>

      <section style={{ padding: '0 24px 120px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          {loading
            ? (
                <div style={{ padding: '48px 0', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
                  Loading posts…
                </div>
              )
            : posts.length === 0
              ? (
                  <div style={{ padding: '48px 0', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
                    No posts yet.
                  </div>
                )
              : (
                  <>
                    <TagFilter tags={allTags} active={tag} onChange={setTag} />
                    {featured && <Featured post={featured} />}
                    <div
                      className="blog-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '56px 40px',
                      }}
                    >
                      {rest.map((p, i) => <Card key={p.slug} post={p} index={i} />)}
                    </div>
                  </>
                )}
        </div>
      </section>
    </main>
  )
}
