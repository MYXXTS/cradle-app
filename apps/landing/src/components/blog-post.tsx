/**
 * Blog post — single article view.
 *
 * Three-column editorial layout: a meta rail on the left (back link, copy
 * link), the article in a 640px center column with a full byline under the
 * title, and a sticky scroll-spy table of contents on the right. A prev/next
 * pager closes the article at the bottom.
 *
 * Fetches /blog/index.json + /blog/<slug>.<lang>.md at runtime.
 */

import { ArrowLeft, ArrowRight, Check, Link2 } from 'lucide-react'
import { marked } from 'marked'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'

import { formatDate, parseFrontmatter, pickLocale, resolveLocale } from '../lib/content'
import type { BlogIndexEntry } from './blog'

interface PostNav {
  slug: string
  title: string
}

interface Post {
  title: string
  date: string
  cover?: string
  author?: string
  tags: string[]
  body: string
  newer?: PostNav
  older?: PostNav
}

function useBlogPost(slug: string) {
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const indexRes = await fetch('/blog/index.json')
        if (!indexRes.ok) { throw new Error('Failed to fetch blog index') }
        const index = await indexRes.json() as BlogIndexEntry[]
        const i = index.findIndex(e => e.slug === slug)
        const entry = index[i]
        if (!entry) {
          if (!cancelled) {
            setNotFound(true)
            setLoading(false)
          }
          return
        }

        const locale = resolveLocale()
        const nav = (e?: BlogIndexEntry): PostNav | undefined => e && ({
          slug: e.slug,
          title: e.title[locale] || e.title.zh || Object.values(e.title)[0] || '',
        })

        const lang = pickLocale(entry.languages)
        const res = await fetch(`/blog/${slug}.${lang}.md`)
        if (!res.ok) { throw new Error(`Failed to fetch ${slug}.${lang}.md`) }
        const { body } = parseFrontmatter(await res.text())

        if (!cancelled) {
          setPost({
            title: entry.title[lang] || Object.values(entry.title)[0] || '',
            date: entry.date,
            cover: entry.cover,
            author: entry.author,
            tags: entry.tags ?? [],
            body,
            newer: nav(index[i - 1]),
            older: nav(index[i + 1]),
          })
          setLoading(false)
        }
      }
      catch (err) {
        console.error('Failed to load blog post:', err)
        if (!cancelled) {
          setNotFound(true)
          setLoading(false)
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [slug])

  return { post, loading, notFound }
}

/* ─── Markdown → html + h2 TOC ────────────────────────────────── */

interface TocItem {
  id: string
  text: string
}

function renderBody(body: string): { html: string, toc: TocItem[] } {
  const toc: TocItem[] = []
  let i = 0
  const html = (marked.parse(body) as string).replace(/<h2>(.*?)<\/h2>/g, (_, inner: string) => {
    const id = `section-${i++}`
    toc.push({ id, text: inner.replace(/<[^>]+>/g, '') })
    return `<h2 id="${id}">${inner}</h2>`
  })
  return { html, toc }
}

function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState('')

  useEffect(() => {
    if (items.length === 0) { return }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) { setActive(visible[0].target.id) }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) { observer.observe(el) }
    }
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) { return null }
  return (
    <nav className="blog-toc" style={{ position: 'sticky', top: 120, alignSelf: 'start' }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 14,
        }}
      >
        On this page
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item) => {
          const isActive = item.id === active
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                style={{
                  display: 'block',
                  padding: '5px 0 5px 12px',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: isActive ? 'var(--text)' : 'var(--text-muted)',
                  borderLeft: `1px solid ${isActive ? 'var(--text)' : 'var(--border)'}`,
                  textDecoration: 'none',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {item.text}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ─── Copy link button ────────────────────────────────────────── */

function CopyLink() {
  const [copied, setCopied] = useState(false)
  const Icon = copied ? Check : Link2
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => {
          setCopied(true)
          setTimeout(setCopied, 1600, false)
        })
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: copied ? 'var(--text)' : 'var(--text-muted)',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        transition: 'color 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
      onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.color = 'var(--text-muted)' } }}
    >
      <Icon style={{ width: 12, height: 12 }} />
      {copied ? 'copied' : 'copy link'}
    </button>
  )
}

/* ─── Prev / next pager ───────────────────────────────────────── */

function Pager({ post }: { post: Post }) {
  if (!post.newer && !post.older) { return null }
  const cell = (nav: PostNav | undefined, dir: 'newer' | 'older') => {
    if (!nav) { return <span /> }
    const isNewer = dir === 'newer'
    return (
      <a
        href={`#/blog/${nav.slug}`}
        style={{
          display: 'block',
          textDecoration: 'none',
          textAlign: isNewer ? 'left' : 'right',
          padding: '20px 0',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 8,
          }}
        >
          {isNewer && <ArrowLeft style={{ width: 11, height: 11 }} />}
          {isNewer ? 'Newer' : 'Older'}
          {!isNewer && <ArrowRight style={{ width: 11, height: 11 }} />}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.015em',
            lineHeight: 1.4,
            color: 'var(--text-secondary)',
          }}
        >
          {nav.title}
        </span>
      </a>
    )
  }
  return (
    <nav
      className="blog-pager"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 32,
        marginTop: 72,
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      {cell(post.newer, 'newer')}
      {cell(post.older, 'older')}
    </nav>
  )
}

/* ─── Page ─────────────────────────────────────────────────────── */

export function BlogPostPage({ slug }: { slug: string }) {
  const { post, loading, notFound } = useBlogPost(slug)
  const { html, toc } = useMemo(
    () => (post ? renderBody(post.body) : { html: '', toc: [] }),
    [post],
  )
  const minutes = post ? Math.max(1, Math.round(post.body.replace(/\s+/g, '').length / 600)) : 0

  return (
    <main>
      <div
        className="blog-post-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: '160px minmax(0, 640px) 180px',
          gap: 64,
          justifyContent: 'center',
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(120px, 16dvh, 168px) 24px 120px',
        }}
      >
        <motion.aside
          className="blog-post-rail"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ position: 'sticky', top: 120, alignSelf: 'start' }}
        >
          <a
            href="#/blog"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 20,
              color: 'var(--text-muted)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft style={{ width: 12, height: 12 }} />
            all posts
          </a>
          <div>
            <CopyLink />
          </div>
        </motion.aside>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ minWidth: 0 }}
        >
          {loading
            ? (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
                  Loading post…
                </span>
              )
            : notFound || !post
              ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
                    Post not found.
                  </span>
                )
              : (
                  <article>
                    <header style={{ marginBottom: 48 }}>
                      <h1
                        style={{
                          fontSize: 'clamp(1.9rem, 4.5vw, 2.7rem)',
                          fontWeight: 650,
                          lineHeight: 1.12,
                          letterSpacing: '-0.035em',
                          color: 'var(--text)',
                          marginBottom: 20,
                        }}
                      >
                        {post.title}
                      </h1>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {post.author && <span style={{ color: 'var(--text-secondary)' }}>{post.author}</span>}
                        {post.author && <span>·</span>}
                        <time dateTime={post.date}>{formatDate(post.date)}</time>
                        <span>·</span>
                        <span>
                          {minutes}
                          {' '}
                          min read
                        </span>
                        {post.tags.map(t => (
                          <span
                            key={t}
                            style={{
                              fontSize: 10.5,
                              fontWeight: 500,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              border: '1px solid var(--border)',
                              borderRadius: 999,
                              padding: '3px 9px',
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </header>
                    {post.cover && (
                      <img
                        src={post.cover}
                        alt=""
                        decoding="async"
                        style={{
                          display: 'block',
                          width: '100%',
                          aspectRatio: '2 / 1',
                          objectFit: 'cover',
                          borderRadius: 14,
                          marginBottom: 48,
                        }}
                      />
                    )}
                    <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
                    <Pager post={post} />
                  </article>
                )}
        </motion.div>

        {!loading && post && <Toc items={toc} />}
      </div>
    </main>
  )
}
