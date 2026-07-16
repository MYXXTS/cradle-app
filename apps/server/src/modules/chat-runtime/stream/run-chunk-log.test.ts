import { describe, expect, it, vi } from 'vitest'

import { createRunChunkLog } from './run-chunk-log'

describe('run chunk log', () => {
  it('assigns stable monotonic cursors through terminal publication', () => {
    const log = createRunChunkLog('run-1', 10)
    const first = log.append({ type: 'start', messageId: 'message-1' }, false)
    const second = log.append({ type: 'finish', finishReason: 'stop' }, true)

    expect(first).toMatchObject({ runId: 'run-1', cursor: 0, terminal: false })
    expect(second).toMatchObject({ runId: 'run-1', cursor: 1, terminal: true })
    expect(log.replayAfter(0)).toMatchObject({
      kind: 'ready',
      cursor: 1,
      live: false,
      items: [second],
    })
  })

  it('requires a snapshot when the requested cursor was evicted', () => {
    const log = createRunChunkLog('run-1', 2)
    log.append({ type: 'start', messageId: 'message-1' }, false)
    log.append({ type: 'text-start', id: 'text-1' }, false)
    log.append({ type: 'text-delta', id: 'text-1', delta: 'hello' }, false)

    expect(log.replayAfter()).toEqual({
      kind: 'snapshot-required',
      runId: 'run-1',
      latestCursor: 2,
    })
    expect(log.replayAfter(0)).toMatchObject({ kind: 'ready', cursor: 2 })
  })

  it('keeps an empty active log live and publishes each entry once', () => {
    const log = createRunChunkLog('run-1', 10)
    const subscriber = vi.fn()
    const unsubscribe = log.subscribe(subscriber)

    expect(log.replayAfter()).toEqual({
      kind: 'ready',
      runId: 'run-1',
      items: [],
      cursor: -1,
      live: true,
    })

    const entry = log.append({ type: 'start', messageId: 'message-1' }, false)
    expect(subscriber).toHaveBeenCalledOnce()
    expect(subscriber).toHaveBeenCalledWith(entry)
    unsubscribe()
  })
})
