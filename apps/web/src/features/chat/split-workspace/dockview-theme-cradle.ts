import 'dockview-react/dist/styles/dockview.css'
import './dockview-theme-cradle.css'

import type { DockviewTheme } from 'dockview-react'

/**
 * dockview theme backed entirely by Cradle's own design tokens (see
 * dockview-theme-cradle.css). Colors are not baked in here — they live in
 * CSS custom properties that already respond to light/dark mode.
 */
export const themeCradle: DockviewTheme = {
  name: 'cradle',
  className: 'dockview-theme-cradle',
  gap: 4,
  dndOverlayMounting: 'relative',
  dndPanelOverlay: 'content',
  dndTabIndicator: 'fill',
  tabGroupIndicator: 'none',
}
