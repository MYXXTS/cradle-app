/**
 * SupportStrip — a quiet credibility band listing the agents Cradle
 * orchestrates. Reinforces "every agent, one home" right under the hero.
 *
 * Asset-free: agent names as muted type (no logos), which keeps the band on
 * the elegant/dark typographic axis and trivial to maintain.
 */

import { motion } from 'motion/react'

const AGENTS = [
  'Claude Code',
  'Cursor',
  'Codex',
  'Copilot',
  'Gemini CLI',
  'OpenCode',
]

const EASE = [0.22, 1, 0.36, 1] as const

export function SupportStrip() {
  return (
    <section
      style={{
        padding: '48px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg)',
      }}
    >
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 24,
        }}
      >
        Works with the tools you already use
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px 32px',
          maxWidth: 760,
          margin: '0 auto',
        }}
      >
        {AGENTS.map(agent => (
          <span
            key={agent}
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '-0.01em',
            }}
          >
            {agent}
          </span>
        ))}
      </motion.div>
    </section>
  )
}
