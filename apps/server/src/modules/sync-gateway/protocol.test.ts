import { describe, expect, it } from 'vitest'

import { SyncConnection } from './connection'
import { parseSyncClientFrame } from './protocol'

describe('sync-gateway protocol', () => {
  it('parses ping and session-tail sub frames', () => {
    expect(parseSyncClientFrame({ op: 'ping', ts: 1_700_000_000 })).toEqual({
      op: 'ping',
      ts: 1_700_000_000,
    })
    expect(parseSyncClientFrame({
      op: 'sub',
      subId: 'sub-1',
      channel: 'session-tail',
      sessionId: 'session-1',
      afterVersion: 0,
    })).toMatchObject({
      channel: 'session-tail',
      sessionId: 'session-1',
    })
  })
})

describe('sync-gateway connection', () => {
  it('responds to ping with pong', () => {
    const sent: unknown[] = []
    const connection = new SyncConnection({
      id: 'ws-1',
      readyState: 1,
      send: (frame: unknown) => {
        sent.push(frame)
      },
    } as never)

    connection.handleMessage({ op: 'ping', ts: 42 })
    expect(sent).toEqual([{ op: 'pong', ts: 42 }])
  })
})
