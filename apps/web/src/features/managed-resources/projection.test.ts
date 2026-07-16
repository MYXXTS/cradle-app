import { describe, expect, it } from 'vitest'

import type { DownloadTask } from '~/features/download-center/types'

import type { ManagedResource } from './projection'
import {
  managedResourceKey,
  projectResourceTransferProgress,
  taskBelongsToResource,
} from './projection'

const resource = {
  key: { namespace: 'chronicle', resourceType: 'model-resource', resourceId: 'audio-asr' },
} as ManagedResource

function task(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    taskId: 'task-1',
    scope: 'server',
    owner: { ...resource.key, displayName: 'Speech Recognition' },
    fileName: 'model.onnx',
    sourceId: 'source-1',
    status: 'downloading',
    transferredBytes: 25,
    totalBytes: 100,
    attempts: 1,
    maxAttempts: 1,
    error: null,
    result: null,
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:01.000Z',
    startedAt: '2026-07-16T00:00:00.000Z',
    finishedAt: null,
    ...patch,
  }
}

describe('managed resource transfer projection', () => {
  it('joins only the exact namespace/resourceType/resourceId triple', () => {
    expect(taskBelongsToResource(task(), resource)).toBe(true)
    expect(taskBelongsToResource(task({ owner: { ...task().owner, resourceId: 'audio-asr-v2' } }), resource)).toBe(false)
    expect(taskBelongsToResource(task({ owner: { ...task().owner, resourceType: 'model-resource-file' } }), resource)).toBe(false)
    expect(managedResourceKey(resource)).toBe('["chronicle","model-resource","audio-asr"]')
  })

  it('aggregates multi-file progress only when every total is known', () => {
    expect(projectResourceTransferProgress([
      task(),
      task({ taskId: 'task-2', transferredBytes: 50, totalBytes: 100 }),
    ])).toMatchObject({ transferredBytes: 75, totalBytes: 200, percent: 38 })
    expect(projectResourceTransferProgress([
      task(),
      task({ taskId: 'task-2', transferredBytes: 50, totalBytes: null }),
    ])).toMatchObject({ transferredBytes: 75, totalBytes: null, percent: null })
  })

  it('keeps terminal failure separate from active progress', () => {
    const failed = task({ status: 'failed', transferredBytes: 5, totalBytes: 10 })
    expect(projectResourceTransferProgress([failed])).toMatchObject({
      activeTasks: [],
      failedTask: failed,
      transferredBytes: 0,
    })
  })
})
