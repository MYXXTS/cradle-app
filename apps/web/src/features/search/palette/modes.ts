import {
  CommandLine,
  FileLine,
  FolderOpenLine,
  HashtagLine,
  Message1Line,
  SearchLine,
} from '@mingcute/react'
import type { ComponentType } from 'react'

import type { PaletteModeId } from './types'

/**
 * Mode configuration for the command palette. Mode is explicit state, decoupled
 * from the input - the input holds only the search query (no leading prefix).
 * The `prefix` chars (`>`, `/`, `#`, `@`) survive as power-user shortcuts:
 * typing one at the start of the input switches mode and is consumed, so the
 * e2e suite's `fill(">设置")` still lands in command mode searching `设置`.
 */
export interface PaletteModeConfig {
  id: PaletteModeId
  prefix: '' | '>' | '/' | '#' | '@'
  /** i18n key for the filter badge label. */
  badgeLabelKey: string
  /** i18n key for the input placeholder. */
  placeholderKey: string
  icon: ComponentType<{ className?: string }>
}

export const PALETTE_MODES = [
  { id: 'all', prefix: '', badgeLabelKey: 'badge.all', placeholderKey: 'mode.quickOpen.placeholder', icon: SearchLine },
  { id: 'commands', prefix: '>', badgeLabelKey: 'badge.commands', placeholderKey: 'mode.command.placeholder', icon: CommandLine },
  { id: 'files', prefix: '/', badgeLabelKey: 'badge.files', placeholderKey: 'mode.files.placeholder', icon: FileLine },
  { id: 'threads', prefix: '@', badgeLabelKey: 'badge.threads', placeholderKey: 'mode.threads.placeholder', icon: Message1Line },
  { id: 'issues', prefix: '#', badgeLabelKey: 'badge.issues', placeholderKey: 'mode.issues.placeholder', icon: HashtagLine },
  { id: 'workspaces', prefix: '', badgeLabelKey: 'badge.workspaces', placeholderKey: 'mode.workspaces.placeholder', icon: FolderOpenLine },
] as const satisfies PaletteModeConfig[]

export const PALETTE_MODE_BY_ID = new Map<PaletteModeId, PaletteModeConfig>(
  PALETTE_MODES.map(mode => [mode.id, mode]),
)

/** Literal placeholder keys per mode, for type-safe `t()` lookups. */
export const PLACEHOLDER_KEY = {
  all: 'mode.quickOpen.placeholder',
  commands: 'mode.command.placeholder',
  files: 'mode.files.placeholder',
  threads: 'mode.threads.placeholder',
  issues: 'mode.issues.placeholder',
  workspaces: 'mode.workspaces.placeholder',
} as const satisfies Record<PaletteModeId, string>

/** Power-user prefix -> mode map, for consuming a leading prefix on input. */
export const PREFIX_TO_MODE = {
  '>': 'commands',
  '/': 'files',
  '#': 'issues',
  '@': 'threads',
} as const satisfies Record<string, PaletteModeId>

/**
 * Parse the store's `initialQuery` into an initial mode + clean query. Used
 * once when the palette opens (e.g. ⌘⇧P passes `>` -> command mode).
 */
export function parseInitialQuery(initialQuery: string): { mode: PaletteModeId, query: string } {
  const head = initialQuery[0]
  const prefixMode = head ? PREFIX_TO_MODE[head as keyof typeof PREFIX_TO_MODE] : undefined
  if (prefixMode) {
    return { mode: prefixMode, query: initialQuery.slice(1).trimStart() }
  }
  return { mode: 'all', query: initialQuery.trim() }
}
