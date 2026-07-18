/**
 * Blog — post index.
 *
 * A quiet reading list: each row is a link to `#/blog/<slug>` — date, title,
 * and description on the left, the post's cover thumbnail on the right.
 * Hover brightens the title and nudges the arrow — nothing more.
 *
 * Data is loaded at runtime from /blog/index.json.
 */

import { ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { formatDate, resolveLocale } from '../lib/content'

export interface BlogIndexEntry {
  slug: string
  date: string
  title: Record<string, string>
  description: Record<string, string>
  cover?: string
  languages: string[]
}

export interface BlogPostMeta {
  slug: string
  date: string
  title: string
  description: string
  cover?: string
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

function PostRow({ post, index }: { post: BlogPostMeta, index: number }) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.a
      href={`#/blog/${post.slug}`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="blog-post-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 200px',
        gap: '12px 36px',
        alignItems: 'center',
        padding: '28px 0',
        borderTop: '1px solid var(--border-subtle)',
        textDecoration: 'none',
      }}
    >
      <span style={{ display: 'block', minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
            marginBottom: 8,
          }}
        >
          {formatDate(post.date)}
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: hovered ? 'var(--text)' : 'color-mix(in srgb, var(--text), var(--text-secondary) 15%)',
            marginBottom: 6,
            transition: 'color 0.15s',
          }}
        >
          {post.title}
          <ArrowUpRight
            style={{
              width: 13,
              height: 13,
              flexShrink: 0,
              alignSelf: 'center',
              color: hovered ? 'var(--text)' : 'var(--text-muted)',
              transform: hovered ? 'translate(2px, -2px)' : 'none',
              transition: 'transform 0.2s ease, color 0.15s',
            }}
          />
        </span>
        {post.description && (
          <span
            style={{
              display: 'block',
              fontSize: 14,
              lineHeight: 1.65,
              color: 'var(--text-muted)',
              maxWidth: 480,
            }}
          >
            {post.description}
          </span>
        )}
      </span>
      {post.cover && (
        <img
          src={post.cover}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            display: 'block',
            width: '100%',
            aspectRatio: '5 / 3',
            objectFit: 'cover',
            borderRadius: 8,
            border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
            background: 'var(--bg-subtle)',
            transition: 'border-color 0.2s',
          }}
        />
      )}
    </motion.a>
  )
}

export function BlogPage() {
  const { posts, loading } = useBlogIndex()

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
              Blog
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
              Notes from the workshop
            </h1>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                maxWidth: 420,
              }}
            >
              Longer-form writing about what we’re building and why.
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
                  Loading posts…
                </div>
              )
            : posts.length === 0
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
                    No posts yet.
                  </div>
                )
              : posts.map((p, i) => <PostRow key={p.slug} post={p} index={i} />)}
        </div>
      </section>
    </main>
  )
}
