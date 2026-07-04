/**
 * CTA — closing download section.
 */

import { Download } from 'lucide-react'
import { motion } from 'motion/react'
import type { CSSProperties } from 'react'

export function CTASection() {
  return (
    <section
      id="download"
      style={{
        padding: 'clamp(96px, 16dvh, 160px) 24px',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15% 0px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}
      >
        <h2
          style={{
            fontSize: 'clamp(1.6rem, 3.6vw, 2.4rem)',
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: '-0.025em',
            color: 'var(--text)',
            marginBottom: 14,
          }}
        >
          Your agents are waiting.
        </h2>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            maxWidth: 400,
            margin: '0 auto 32px',
          }}
        >
          Download Cradle and turn scattered tools into one command center.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <motion.a
            href="https://github.com/wibus-wee/cradle-app/releases"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={primaryButtonStyle}
          >
            <Download style={{ width: 14, height: 14 }} />
            Download for macOS
          </motion.a>
          <motion.a
            href="https://github.com/wibus-wee/cradle-app"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={ghostButtonStyle}
          >
            View on GitHub
          </motion.a>
        </div>

        <p style={{ marginTop: 22, fontSize: 11, color: 'var(--text-muted)' }}>
          macOS 14+ · Apple Silicon & Intel · Free forever
        </p>
      </motion.div>
    </section>
  )
}

const primaryButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '11px 22px',
  background: 'var(--text)',
  color: 'var(--bg)',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: 8,
}

const ghostButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '11px 22px',
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  fontSize: 13,
  fontWeight: 500,
  textDecoration: 'none',
  borderRadius: 8,
}
