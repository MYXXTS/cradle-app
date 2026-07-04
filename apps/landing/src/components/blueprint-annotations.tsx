/**
 * Shared UI primitives for the landing page.
 *
 * Trimmed to the Star decorations used by the changelog's featured release.
 * The blueprint guide lines and theme toggle were removed with the redesign
 * (the site is now dark-only, shader-backed).
 */

/* ─── Star corner decoration ───────────────────────────────────── */

interface StarProps {
  className?: string
  style?: React.CSSProperties
}

export function Star({ className, style }: StarProps) {
  return (
    <div className={className} style={{ width: 14, height: 14, ...style }}>
      <svg viewBox="0 0 30 30" style={{ width: '100%', height: '100%' }}>
        <path
          fill="var(--text-muted)"
          d="M15 0 C19 9 21 11 30 15 C21 19 19 21 15 30 C11 21 9 19 0 15 C9 11 11 9 15 0 Z"
        />
      </svg>
    </div>
  )
}

/* ─── Star Borders — 4-star corner frame ─────────────────────────── */

export function StarBorders({ children }: { children?: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        border: '1px dashed var(--border-strong)',
        overflow: 'hidden',
      }}
    >
      <Star style={{ position: 'absolute', top: -6, right: -6, zIndex: 50 }} />
      <Star style={{ position: 'absolute', bottom: -6, right: -6, zIndex: 50 }} />
      <Star style={{ position: 'absolute', top: -6, left: -6, zIndex: 50 }} />
      <Star style={{ position: 'absolute', bottom: -6, left: -6, zIndex: 50 }} />
      {children}
    </div>
  )
}
