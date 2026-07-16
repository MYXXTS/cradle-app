import type {
  SyncClientFrame,
  SyncClientSubFrame,
  SyncServerFrame,
} from '@cradle/chat-runtime-contracts'
import { z } from 'zod'

const SyncClientSubFrameSchema = z.discriminatedUnion('channel', [
  z.object({
    op: z.literal('sub'),
    subId: z.string().min(1),
    channel: z.literal('sessions-tail'),
    afterSequenceId: z.number().int().nonnegative(),
    workspaceId: z.string().optional(),
  }),
  z.object({
    op: z.literal('sub'),
    subId: z.string().min(1),
    channel: z.literal('session-tail'),
    sessionId: z.string().min(1),
    afterVersion: z.number().int().nonnegative(),
  }),
  z.object({
    op: z.literal('sub'),
    subId: z.string().min(1),
    channel: z.literal('run-chunks'),
    sessionId: z.string().min(1),
    after: z.object({
      runId: z.string().min(1),
      cursor: z.number().int().nonnegative(),
    }).optional(),
  }),
  z.object({
    op: z.literal('sub'),
    subId: z.string().min(1),
    channel: z.literal('workspace-files'),
    workspaceId: z.string().min(1),
  }),
])

export const SyncClientFrameSchema = z.union([
  SyncClientSubFrameSchema,
  z.object({
    op: z.literal('unsub'),
    subId: z.string().min(1),
  }),
  z.object({
    op: z.literal('ping'),
    ts: z.number(),
  }),
])

export function parseSyncClientFrame(message: unknown): SyncClientFrame {
  const raw = typeof message === 'string' ? JSON.parse(message) : message
  return SyncClientFrameSchema.parse(raw)
}

export function isSyncClientSubFrame(frame: SyncClientFrame): frame is SyncClientSubFrame {
  return frame.op === 'sub'
}

export function encodeSyncServerFrame(frame: SyncServerFrame): string {
  return JSON.stringify(frame)
}
