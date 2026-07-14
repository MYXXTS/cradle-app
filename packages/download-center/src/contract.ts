export type DownloadScope = 'server' | 'desktop'

export type DownloadTaskStatus
  = | 'queued'
    | 'downloading'
    | 'verifying'
    | 'completed'
    | 'failed'
    | 'cancelled'

export interface DownloadOwner {
  namespace: string
  resourceType: string
  resourceId: string
  displayName: string
}

export interface DownloadSource {
  id: string
  url: string
  headers?: Readonly<Record<string, string>>
}

export interface DownloadIntegrity {
  expectedBytes?: number
  checksum?: {
    algorithm: 'sha256' | 'sha512'
    value: string
  }
}

export interface DownloadRequest {
  owner: DownloadOwner
  fileName: string
  sources: readonly DownloadSource[]
  integrity?: DownloadIntegrity
  maxBytes: number
  maxAttempts?: number
}

export interface DownloadedArtifact {
  taskId: string
  filePath: string
  bytes: number
  checksum: DownloadChecksumResult
}

export interface DownloadChecksumResult {
  algorithm: 'sha256' | 'sha512'
  expected: string | null
  actual: string
  matched: boolean | null
}

export interface DownloadTaskResult {
  taskId: string
  bytes: number
  checksum: DownloadChecksumResult
}

export interface DownloadTaskView {
  taskId: string
  scope: DownloadScope
  owner: DownloadOwner
  fileName: string
  sourceId: string | null
  status: DownloadTaskStatus
  transferredBytes: number
  totalBytes: number | null
  attempts: number
  maxAttempts: number
  error: DownloadTaskErrorView | null
  result: DownloadTaskResult | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface DownloadTaskErrorView {
  code: string
  message: string
  retryable: boolean
}

export interface DownloadProgress {
  taskId: string
  sourceId: string | null
  status: Extract<DownloadTaskStatus, 'downloading' | 'verifying' | 'completed' | 'failed' | 'cancelled'>
  transferredBytes: number
  totalBytes: number | null
  error: DownloadTaskErrorView | null
}

export interface DownloadResumeState {
  sourceId: string
  etag: string | null
}

/** Host-internal retry context. It must not be projected into public task views. */
export interface DownloadFailureContext {
  sourceId: string
  etag: string | null
  transferredBytes: number
  totalBytes: number | null
}

export interface DownloadExecution {
  taskId: string
  request: DownloadRequest
  signal?: AbortSignal
  prior?: DownloadResumeState
}

export interface DownloadExecutionResult {
  artifact: DownloadedArtifact
  sourceId: string
  etag: string | null
}

export const toDownloadTaskResult = (artifact: DownloadedArtifact): DownloadTaskResult => ({
  taskId: artifact.taskId,
  bytes: artifact.bytes,
  checksum: artifact.checksum,
})

export const validateDownloadRequest = (request: DownloadRequest): void => {
  if (
    request.fileName.length === 0
    || request.fileName === '.'
    || request.fileName === '..'
    || request.fileName.includes('/')
    || request.fileName.includes('\\')
    || request.fileName.includes('\0')
  ) {
    throw new TypeError('fileName must be a single non-empty basename.')
  }
  if (request.sources.length === 0) {
    throw new TypeError('At least one download source is required.')
  }
  if (!Number.isSafeInteger(request.maxBytes) || request.maxBytes <= 0) {
    throw new TypeError('maxBytes must be a positive safe integer.')
  }
  if (request.integrity?.expectedBytes !== undefined && (!Number.isSafeInteger(request.integrity.expectedBytes) || request.integrity.expectedBytes < 0)) {
    throw new TypeError('expectedBytes must be a non-negative safe integer.')
  }
  for (const source of request.sources) {
    if (source.id.length === 0) {
      throw new TypeError('Download source ID must not be empty.')
    }
    let url: URL
    try {
      url = new URL(source.url)
    }
    catch {
      throw new TypeError('Download source URL is invalid.')
    }
    if (url.protocol !== 'https:') {
      throw new TypeError('Download source URL must use HTTPS.')
    }
  }
}

export const isStrongEtag = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && /^"[^"\r\n]*"$/.test(value)
