/**
 * Blog post — single article view.
 *
 * Content column (max 680px) with a sticky table-of-contents rail on the
 * right, generated from the post's `##` headings. Fetches
 * /blog/<slug>.<lang>.md at runtime, falling back across available languages.
 */

import { ArrowLeft } from 'lucide-react'
import { marked } from 'marked'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'

import { formatDate, parseFrontmatter, pickLocale } from '../lib/content'
import type { BlogIndexEntry } from './blog'

interface Post {
  title: string
  date: string
  cover?: string
  body: string
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
        const entry = index.find(e => e.slug === slug)
        if (!entry) {
          if (!cancelled) {
            setNotFound(true)
            setLoading(false)
          }
          return
        }

        const lang = pickLocale(entry.languages)
        const res = await fetch(`/blog/${slug}.${lang}.md`)
        if (!res.ok) { throw new Error(`Failed to fetch ${slug}.${lang}.md`) }
        const { body } = parseFrontmatter(await res.text())

        if (!cancelled) {
          setPost({
            title: entry.title[lang] || Object.values(entry.title)[0] || '',
            date: entry.date,
            cover: entry.cover,
            body,
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
        {items.map(item => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              style={{
                display: 'block',
                padding: '5px 0',
                fontSize: 12.5,
                lineHeight: 1.5,
                color: 'var(--text-muted)',
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ol>
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
              marginBottom: 28,
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
          {post && (
            <>
              <time
                dateTime={post.date}
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                }}
              >
                {formatDate(post.date)}
              </time>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                {minutes}
                {' '}
                min read
              </span>
            </>
          )}
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
                    <header style={{ marginBottom: 40 }}>
                      <h1
                        style={{
                          fontSize: 'clamp(1.7rem, 4.5vw, 2.4rem)',
                          fontWeight: 650,
                          lineHeight: 1.15,
                          letterSpacing: '-0.03em',
                          color: 'var(--text)',
                        }}
                      >
                        {post.title}
                      </h1>
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
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          marginBottom: 40,
                        }}
                      />
                    )}
                    <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
                  </article>
                )}
        </motion.div>

        {!loading && post && <Toc items={toc} />}
      </div>
    </main>
  )
}
