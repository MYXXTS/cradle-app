/**
 * ProductPreview — the real Cradle screenshot, floating in a field of
 * drifting light beams.
 *
 * The atmosphere is a ported Aceternity BackgroundBeams (fifty animated
 * gradients sweeping along bezier paths), recolored cyan→purple to match the
 * landing's feature-illustration palette. The screenshot itself stays clean
 * — hairline frame, soft shadow, no gimmicky border effect competing with
 * the beam field around it.
 */

import { motion } from 'motion/react'

import { BackgroundBeams } from './magicui'

const EASE = [0.22, 1, 0.36, 1] as const

export function ProductPreview() {
  return (
    <section
      style={{
        padding: 'clamp(40px, 6dvh, 72px) 24px clamp(72px, 12dvh, 120px)',
        background: 'var(--bg)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Drifting light beams — faded at the edges so the field has no hard
          boundary. The opaque screenshot covers the center; beams glow around. */}
      <BackgroundBeams
        style={{
          maskImage:
            'radial-gradient(ellipse 90% 80% at 50% 45%, #000 45%, transparent 105%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 90% 80% at 50% 45%, #000 45%, transparent 105%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.985 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 0.7, ease: EASE }}
        style={{
          position: 'relative',
          maxWidth: 1180,
          margin: '0 auto',
        }}
      >
        <img
          src="/screenshot-dark.png"
          alt="Cradle desktop workspace — sessions, issues, and agents at a glance"
          loading="lazy"
          decoding="async"
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </motion.div>
    </section>
  )
}
