import type { DownloadTask } from '~/features/download-center/types'
import { isActiveDownload } from '~/features/download-center/types'

import type { GetManagedResourcesResponse } from './api/managed-resources-api'

export type ManagedResource = GetManagedResourcesResponse[number]

export interface ResourceTransferProgress {
  activeTasks: readonly DownloadTask[]
  failedTask: DownloadTask | null
  transferredBytes: number
  totalBytes: number | null
  percent: number | null
}

export function managedResourceKey(resource: Pick<ManagedResource, 'key'>): string {
  return JSON.stringify([
    resource.key.namespace,
    resource.key.resourceType,
    resource.key.resourceId,
  ])
}

export function taskBelongsToResource(task: DownloadTask, resource: Pick<ManagedResource, 'key'>): boolean {
  return task.owner.namespace === resource.key.namespace
    && task.owner.resourceType === resource.key.resourceType
    && task.owner.resourceId === resource.key.resourceId
}

export function projectResourceTransferProgress(tasks: readonly DownloadTask[]): ResourceTransferProgress {
  const activeTasks = tasks.filter(isActiveDownload)
  const transferredBytes = activeTasks.reduce((total, task) => total + task.transferredBytes, 0)
  const knownTotals = activeTasks.every(task => task.totalBytes !== null && task.totalBytes > 0)
  const totalBytes = activeTasks.length > 0 && knownTotals
    ? activeTasks.reduce((total, task) => total + task.totalBytes!, 0)
    : null
  const failedTask = tasks.find(task => task.status === 'failed') ?? null
  return {
    activeTasks,
    failedTask,
    transferredBytes,
    totalBytes,
    percent: totalBytes === null ? null : Math.min(100, Math.round((transferredBytes / totalBytes) * 100)),
  }
}
