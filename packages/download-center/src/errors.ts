import type { DownloadFailureContext, DownloadTaskErrorView } from './contract'

export type DownloadErrorCode
  = | 'cancelled'
    | 'timeout'
    | 'network_error'
    | 'http_client_error'
    | 'http_server_error'
    | 'redirect_error'
    | 'invalid_response'
    | 'byte_limit_exceeded'
    | 'size_mismatch'
    | 'checksum_mismatch'
    | 'filesystem_error'

const safeMessages: Record<DownloadErrorCode, string> = {
  cancelled: 'The download was cancelled.',
  timeout: 'The download became inactive and timed out.',
  network_error: 'The download failed because of a network error.',
  http_client_error: 'The download source rejected the request.',
  http_server_error: 'The download source is temporarily unavailable.',
  redirect_error: 'The download source returned an unsafe or excessive redirect.',
  invalid_response: 'The download source returned an invalid response.',
  byte_limit_exceeded: 'The download exceeded its byte limit.',
  size_mismatch: 'The downloaded file size did not match the expected size.',
  checksum_mismatch: 'The downloaded file checksum did not match.',
  filesystem_error: 'The download could not be written to storage.',
}

export class DownloadError extends Error {
  readonly code: DownloadErrorCode
  readonly retryable: boolean
  resumeContext: DownloadFailureContext | null

  constructor(
    code: DownloadErrorCode,
    retryable: boolean,
    options?: ErrorOptions,
    resumeContext: DownloadFailureContext | null = null,
  ) {
    super(safeMessages[code], options)
    this.name = 'DownloadError'
    this.code = code
    this.retryable = retryable
    this.resumeContext = resumeContext
  }

  withResumeContext(context: DownloadFailureContext): this {
    this.resumeContext = context
    return this
  }

  toView(): DownloadTaskErrorView {
    return { code: this.code, message: this.message, retryable: this.retryable }
  }
}

export const asDownloadError = (error: unknown): DownloadError => {
  if (error instanceof DownloadError) {
    return error
  }
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && /^(EACCES|EBADF|EEXIST|EIO|ENOENT|ENOSPC|EPERM|EROFS)$/.test(error.code)) {
    return new DownloadError('filesystem_error', false, { cause: error })
  }
  return new DownloadError('network_error', true, error instanceof Error ? { cause: error } : undefined)
}
