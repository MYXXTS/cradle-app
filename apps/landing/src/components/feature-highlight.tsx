/**
 * FeatureHighlight — a deeper dive on a signature capability.
 *
 * Split layout: copy on one side, a larger custom illustration on the other.
 * `reversed` swaps the columns so consecutive highlights alternate rhythm.
 * Illustrations are abstract (same vocabulary as the feature-card marks),
 * never faux product UI.
 */

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const EASE = [0.22, 1, 0.36, 1] as const

interface FeatureHighlightProps {
  eyebrow: string
  headline: ReactNode
  body: string[]
  illustration: ReactNode
  reversed?: boolean
}

export function FeatureHighlight({
  eyebrow,
  headline,
  body,
  illustration,
  reversed,
}: FeatureHighlightProps) {
  return (
    <section
      style={{
        padding: 'clamp(72px, 12dvh, 120px) 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 56,
          alignItems: 'center',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15% 0px' }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ order: reversed ? 2 : 1 }}
        >
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 18,
              padding: '4px 10px',
              border: '1px solid var(--border)',
              borderRadius: 999,
              background: 'var(--fill)',
            }}
          >
            {eyebrow}
          </span>
          <h2
            style={{
              fontSize: 'clamp(1.6rem, 3.4vw, 2.3rem)',
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: 'var(--text)',
              marginBottom: 18,
            }}
          >
            {headline}
          </h2>
          {body.map((p, i) => (
            <p
              key={i}
              style={{
                fontSize: 14,
                lineHeight: 1.75,
                color: 'var(--text-secondary)',
                marginBottom: i < body.length - 1 ? 16 : 0,
              }}
            >
              {p}
            </p>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-15% 0px' }}
          transition={{ duration: 0.7, ease: EASE }}
          style={{ display: 'flex', justifyContent: 'center', order: reversed ? 1 : 2 }}
        >
          {illustration}
        </motion.div>
      </div>
    </section>
  )
}

/* Abstract suspend → wait → resume cycle: three nodes on a ring around a
   still center — reads as a continuous loop without imitating any UI. */
export function AwaitCycleIllustration() {
  return (
    <svg
      viewBox="0 0 280 280"
      fill="none"
      aria-hidden="true"
      style={{ width: 'min(320px, 80vw)', height: 'auto', display: 'block' }}
    >
      <defs>
        <linearGradient id="hl-cycle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      <circle cx="140" cy="140" r="90" stroke="url(#hl-cycle)" strokeWidth="1.5" fill="none" opacity="0.3" />
      <circle cx="140" cy="50" r="10" fill="url(#hl-cycle)" />
      <circle cx="218" cy="185" r="10" fill="url(#hl-cycle)" />
      <circle cx="62" cy="185" r="10" fill="url(#hl-cycle)" />
      <circle cx="140" cy="140" r="5" fill="url(#hl-cycle)" />
      <circle cx="140" cy="140" r="14" stroke="url(#hl-cycle)" strokeWidth="1" fill="none" opacity="0.25" />
    </svg>
  )
}

/* One source fanning out to parallel workers — "orchestrate many agents at
   once". Same abstract vocabulary: nodes + gradient paths, no UI chrome. */
export function MultiAgentIllustration() {
  return (
    <svg
      viewBox="0 0 280 260"
      fill="none"
      aria-hidden="true"
      style={{ width: 'min(320px, 80vw)', height: 'auto', display: 'block' }}
    >
      <defs>
        <linearGradient id="hl-branch" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      <path d="M40 130 C 140 130, 140 50, 240 50" stroke="url(#hl-branch)" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M40 130 L 240 130" stroke="url(#hl-branch)" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M40 130 C 140 130, 140 210, 240 210" stroke="url(#hl-branch)" strokeWidth="1.5" fill="none" opacity="0.5" />
      <circle cx="40" cy="130" r="11" fill="url(#hl-branch)" />
      <circle cx="240" cy="50" r="8" fill="url(#hl-branch)" />
      <circle cx="240" cy="130" r="8" fill="url(#hl-branch)" />
      <circle cx="240" cy="210" r="8" fill="url(#hl-branch)" />
    </svg>
  )
}
