import type { SyncEndReason, SyncServerDataFrame } from '@cradle/chat-runtime-contracts'

export const SYNC_CHUNK_BUFFER_MAX = 512
export const SYNC_CHUNK_BUFFER_MAX_BYTES = 4 * 1024 * 1024
export const SYNC_TAIL_EVENT_BUFFER_MAX = 128

export interface SyncSubscriptionSender {
  send: (frame: SyncServerDataFrame) => void
  end: (reason: SyncEndReason, detail?: string) => void
}

export interface SyncSubscriptionRecord {
  subId: string
  unsubscribe: () => void
  pendingFrames: SyncServerDataFrame[]
  pendingBytes: number
  nextSeq: number
}

export function createBoundedSender(input: {
  subId: string
  sendFrame: (frame: SyncServerDataFrame) => void
  onBackpressure: () => void
  maxFrames: number
  maxBytes: number
}): SyncSubscriptionSender {
  const pending: SyncServerDataFrame[] = []
  let pendingBytes = 0
  let nextSeq = 0
  let ended = false

  const flush = () => {
    while (pending.length > 0) {
      const frame = pending[0]!
      input.sendFrame(frame)
      pending.shift()
      pendingBytes -= estimateFrameBytes(frame)
    }
  }

  const enqueue = (frame: SyncServerDataFrame) => {
    if (ended) {
      return
    }
    const sized = withSeq(frame, nextSeq++)
    const bytes = estimateFrameBytes(sized)
    pending.push(sized)
    pendingBytes += bytes
    if (pending.length > input.maxFrames || pendingBytes > input.maxBytes) {
      ended = true
      input.onBackpressure()
      return
    }
    flush()
  }

  return {
    send: enqueue,
    end: (reason, detail) => {
      if (ended) {
        return
      }
      ended = true
      flush()
      input.sendFrame({ subId: input.subId, kind: 'end', reason, detail })
    },
  }
}

function withSeq(frame: SyncServerDataFrame, seq: number): SyncServerDataFrame {
  if (frame.kind === 'sub-ack' || frame.kind === 'end') {
    return frame
  }
  return { ...frame, seq }
}

function estimateFrameBytes(frame: SyncServerDataFrame): number {
  try {
    return JSON.stringify(frame).length
  }
  catch {
    return 1024
  }
}
