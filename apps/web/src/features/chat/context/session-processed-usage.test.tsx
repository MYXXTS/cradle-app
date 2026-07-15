// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '~/i18n/client'

import type { ChatRuntimeCompactUiSlotState } from '../capabilities/chat-capabilities'
import { SessionProcessedUsage } from './session-processed-usage'

afterEach(cleanup)

describe('sessionProcessedUsage', () => {
  it('renders the root thread lifetime total without a subagent suffix', async () => {
    renderWithI18n(<SessionProcessedUsage compactState={compactState({
      treeTotal: usage(1_600_000),
      total: usage(1_600_000),
    })}
                   />)

    expect((await screen.findByText('Session processed')).nextElementSibling?.textContent).toBe('1.6M')
    expect(screen.getByText(/Main thread/).textContent).toBe('Main thread 1.6M')
  })

  it('renders the root plus all subagent consumption', async () => {
    renderWithI18n(<SessionProcessedUsage compactState={compactState({
      treeTotal: usage(2_400_000),
      total: usage(1_600_000),
      subagentTotal: usage(800_000),
      subagentCount: 4,
    })}
                   />)

    expect((await screen.findByText('Session processed')).nextElementSibling?.textContent).toBe('2.4M')
    expect(screen.getByText(/Main thread/).textContent).toBe('Main thread 1.6M · 4 subagents 800.0K')
  })

  it('does not render an empty session total', () => {
    const { container } = renderWithI18n(<SessionProcessedUsage compactState={compactState()} />)

    expect(container.childElementCount).toBe(0)
  })
})

function renderWithI18n(node: React.ReactNode) {
  return render(<I18nProvider initialLocale="en-US">{node}</I18nProvider>)
}

function compactState(
  overrides: Partial<ChatRuntimeCompactUiSlotState> = {},
): ChatRuntimeCompactUiSlotState {
  return {
    kind: 'compact',
    slotId: 'codex:compact',
    threadId: 'root',
    turnId: 'turn-1',
    status: 'idle',
    isCompactRelevant: true,
    total: usage(0),
    last: usage(0),
    treeTotal: usage(0),
    subagentTotal: usage(0),
    subagentCount: 0,
    modelContextWindow: 200_000,
    autoCompactTokenLimit: 160_000,
    usagePercent: 0,
    autoCompactPercent: 0,
    lastCompactedAt: null,
    compactionItemId: null,
    updatedAt: 1,
    ...overrides,
  }
}

function usage(totalTokens: number) {
  return {
    totalTokens,
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  }
}
