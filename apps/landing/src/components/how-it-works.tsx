/**
 * HowItWorks — three numbered steps from scattered tools to one workflow.
 *
 * Editorial: mono step numbers, hairline-separated cells, motion stagger.
 * No illustrations here — the Features cards already carry those; steps read
 * cleaner as pure type.
 */

import { motion } from 'motion/react'

const STEPS = [
  {
    n: '01',
    title: 'Connect your agents',
    desc: 'Bring Claude Code, Cursor, Codex, and the rest under one roof. One workspace, every runner, no window-juggling.',
  },
  {
    n: '02',
    title: 'Coordinate the work',
    desc: 'Chain agents, gate on CI and reviews, hand off automatically. Cradle does the waiting — you do the shipping.',
  },
  {
    n: '03',
    title: 'Ship with confidence',
    desc: 'Sessions, checkpoints, and history. Nothing lost, nothing scattered across six tabs. Resume anywhere.',
  },
]

const EASE = [0.22, 1, 0.36, 1] as const

export function HowItWorks() {
  return (
    <section
      style={{
        padding: 'clamp(72px, 12dvh, 120px) 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg)',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15% 0px' }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{ textAlign: 'center', marginBottom: 64 }}
        >
          <h2
            style={{
              fontSize: 'clamp(1.5rem, 3.2vw, 2.2rem)',
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: 'var(--text)',
              marginBottom: 14,
            }}
          >
            From scattered tools to one workflow.
          </h2>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              maxWidth: 460,
              margin: '0 auto',
            }}
          >
            Three steps to a command center that actually coordinates your agents.
          </p>
        </motion.div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 24,
          }}
        >
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10% 0px' }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
              style={{ padding: '8px 0' }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                }}
              >
                {step.n}
              </span>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginTop: 14,
                  marginBottom: 10,
                  letterSpacing: '-0.015em',
                }}
              >
                {step.title}
              </h3>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
