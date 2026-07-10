import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { markPullRequestReady, resetTokenCache } from './github-api'

const originalGitHubToken = process.env.GH_TOKEN

describe('markPullRequestReady', () => {
  beforeEach(() => {
    process.env.GH_TOKEN = 'test-token'
    resetTokenCache()
  })

  afterEach(() => {
    if (originalGitHubToken === undefined) {
      delete process.env.GH_TOKEN
    }
    else {
      process.env.GH_TOKEN = originalGitHubToken
    }
    resetTokenCache()
    vi.unstubAllGlobals()
  })

  it('uses GitHub GraphQL to convert a draft pull request to ready for review', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        node_id: 'PR_node_id',
        number: 14,
        title: 'Fix retries',
        state: 'open',
        draft: true,
        merged: false,
        mergeable: true,
        mergeable_state: 'clean',
        html_url: 'https://github.com/cradle/app/pull/14',
        head: { sha: 'head-sha', ref: 'feature' },
        base: { ref: 'main' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          markPullRequestReadyForReview: {
            pullRequest: {
              number: 14,
              title: 'Fix retries',
              isDraft: false,
              url: 'https://github.com/cradle/app/pull/14',
              state: 'OPEN',
              headRefName: 'feature',
              baseRefName: 'main',
              headRefOid: 'head-sha',
            },
          },
        },
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(markPullRequestReady('cradle', 'app', 14)).resolves.toEqual({
      number: 14,
      title: 'Fix retries',
      draft: false,
      html_url: 'https://github.com/cradle/app/pull/14',
      state: 'open',
      head: { sha: 'head-sha', ref: 'feature' },
      base: { ref: 'main' },
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/repos/cradle/app/pulls/14',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    const graphQlRequest = fetchMock.mock.calls[1]
    expect(graphQlRequest?.[0]).toBe('https://api.github.com/graphql')
    expect(graphQlRequest?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    }))
    expect(JSON.parse(graphQlRequest?.[1]?.body as string)).toEqual(expect.objectContaining({
      variables: { pullRequestId: 'PR_node_id' },
      query: expect.stringContaining('markPullRequestReadyForReview'),
    }))
  })
})
