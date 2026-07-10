import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  executeWorkPrepareTool,
  WORK_PREPARE_TOOL_DESCRIPTION,
} from './prepare'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('work_prepare Agent tool', () => {
  it('uses mandatory local-only finalization language', () => {
    expect(WORK_PREPARE_TOOL_DESCRIPTION).toContain('You MUST call this tool')
    expect(WORK_PREPARE_TOOL_DESCRIPTION).toContain('MUST NOT claim completion')
    expect(WORK_PREPARE_TOOL_DESCRIPTION).toContain('NEVER pushes')
  })

  it('prepares Work through the owning HTTP API', async () => {
    vi.stubEnv('CRADLE_SERVER_URL', 'http://127.0.0.1:21423')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      work: {
        id: 'work-1',
        preparedAt: 20,
      },
      readiness: {
        clean: true,
        commitsAhead: 2,
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const result = await executeWorkPrepareTool({
      workId: 'work-1',
      title: 'Prepare Work',
      summary: 'Implemented native preparation.',
      testPlan: 'Run focused tests.',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/works/work-1/prepare', 'http://127.0.0.1:21423'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Prepare Work',
          summary: 'Implemented native preparation.',
          testPlan: 'Run focused tests.',
        }),
      }),
    )
    expect(result).toMatchObject({
      structuredContent: {
        workId: 'work-1',
        prepared: true,
        clean: true,
        commitsAhead: 2,
      },
    })
  })

  it('returns a mandatory remediation result when Work is not ready', async () => {
    vi.stubEnv('CRADLE_SERVER_URL', 'http://127.0.0.1:21423')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'work_checkout_dirty',
      message: 'Commit or discard all Work changes before preparing delivery',
    }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    }))

    const result = await executeWorkPrepareTool({
      workId: 'work-1',
      title: 'Prepare Work',
      summary: 'Implemented native preparation.',
      testPlan: 'Run focused tests.',
    })

    expect(result).toMatchObject({ isError: true })
    expect(result.content[0]?.text).toContain('Do not claim completion')
    expect(result.content[0]?.text).toContain('work_checkout_dirty')
  })
})
