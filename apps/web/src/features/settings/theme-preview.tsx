import type { CSSProperties } from 'react'

import { cn } from '~/lib/cn'
import type { ThemeProfile } from '~/store/theme-customization'
import { resolveThemePreview } from '~/store/theme-customization'

interface ThemePreviewProps {
  profile: ThemeProfile
  className?: string
}

/**
 * A simple theme swatch: background, a couple of typographic lines, and an
 * accent pill. Just enough to read the palette at a glance.
 */
export const ThemePreview = ({ profile, className }: ThemePreviewProps) => {
  const theme = resolveThemePreview(profile)
  const { foregroundColor: fg, backgroundColor: bg, accentColor: accent } = theme
  const contrast = theme.contrast / 100
  const muted = `color-mix(in srgb, ${fg} ${38 + Math.round(contrast * 34)}%, ${bg})`

  const rootStyle: CSSProperties = {
    backgroundColor: bg,
    color: fg,
    fontFamily: theme.uiFont,
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-24 w-full flex-col justify-between overflow-hidden rounded-lg p-3',
        className,
      )}
      style={rootStyle}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold leading-none" style={{ color: fg }}>
          Aa
        </span>
        <span className="h-1 w-3/4 rounded-full" style={{ backgroundColor: muted }} />
        <span className="h-1 w-1/2 rounded-full" style={{ backgroundColor: muted }} />
      </div>
      <span
        className="h-3 w-1/3 self-end rounded-full"
        style={{ backgroundColor: accent }}
      />
    </div>
  )
}

export const SystemThemePreview = ({
  light,
  dark,
}: {
  light: ThemeProfile
  dark: ThemeProfile
}) => (
  <div className="grid h-full w-full grid-cols-2 overflow-hidden rounded-lg">
    <ThemePreview profile={light} className="min-h-0 rounded-none" />
    <ThemePreview profile={dark} className="min-h-0 rounded-none" />
  </div>
)
