// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '~/i18n/client'

import { UsageLocalSummary } from './usage-local-summary'
import type { LocalUsageSummary } from './use-usage-overview'

afterEach(cleanup)

describe('usageLocalSummary', () => {
  it('renders machine totals and provider session counts without source paths', async () => {
    const summary = localSummary() as LocalUsageSummary & { sourcePath: string }
    summary.sourcePath = '/Users/example/.codex/sessions/private.jsonl'

    const { container } = renderWithI18n(
      <UsageLocalSummary summary={summary} isLoading={false} isError={false} />,
    )

    expect((await screen.findByText('Local archive total')).nextElementSibling?.textContent).toBe('165')
    expect(screen.getByText('Codex').parentElement?.nextElementSibling?.textContent).toBe('3 local sessions')
    expect(screen.getByText('Claude Agent').parentElement?.nextElementSibling?.textContent).toBe('2 local sessions')
    expect(container.textContent).not.toContain('/Users/example')
  })

  it('renders provider unavailable and request error states', async () => {
    const unavailable = localSummary()
    unavailable.providers[1]!.status = 'unavailable'
    const { rerender } = renderWithI18n(
      <UsageLocalSummary summary={unavailable} isLoading={false} isError={false} />,
    )
    expect((await screen.findByText('Claude Agent')).parentElement?.nextElementSibling?.textContent).toBe('Local archive unavailable')

    rerender(<I18nProvider initialLocale="en-US"><UsageLocalSummary summary={null} isLoading={false} isError /></I18nProvider>)
    expect(await screen.findByText('Could not read local usage archives')).toBeTruthy()
  })
})

function renderWithI18n(node: React.ReactNode) {
  return render(<I18nProvider initialLocale="en-US">{node}</I18nProvider>)
}

function localSummary(): LocalUsageSummary {
  return {
    generatedAt: 1,
    usage: usage(165),
    providers: [
      {
        providerKind: 'codex',
        status: 'available',
        sourceRootCount: 2,
        sessionCount: 3,
        lastActivityAt: 1,
        usage: usage(120),
      },
      {
        providerKind: 'claude-agent',
        status: 'available',
        sourceRootCount: 1,
        sessionCount: 2,
        lastActivityAt: 1,
        usage: usage(45),
      },
    ],
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
