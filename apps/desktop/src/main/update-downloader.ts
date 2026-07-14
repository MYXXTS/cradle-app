import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Writable } from 'node:stream'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { app } from 'electron'

import type { DesktopUpdateCandidate, DesktopUpdateDownload } from './update-types'

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type DesktopUpdateDownloadProgress = {
  percent: number
  transferredBytes: number
  totalBytes: number | null
}

export type DesktopUpdateDownloaderOptions = {
  downloadDir?: string
  fetchFn?: FetchFn
  writeStreamFactory?: (path: string) => Writable
  renameFn?: typeof rename
}

export class DesktopUpdateDownloader {
  private readonly downloadDir: string
  private readonly fetchFn: FetchFn
  private readonly writeStreamFactory: (path: string) => Writable
  private readonly renameFn: typeof rename

  constructor(options: DesktopUpdateDownloaderOptions = {}) {
    this.downloadDir = options.downloadDir ?? join(app.getPath('userData'), 'updates', 'downloads')
    this.fetchFn = options.fetchFn ?? fetch
    this.writeStreamFactory = options.writeStreamFactory ?? createWriteStream
    this.renameFn = options.renameFn ?? rename
  }

  async download(
    candidate: DesktopUpdateCandidate,
    onProgress?: (progress: DesktopUpdateDownloadProgress) => void,
  ): Promise<DesktopUpdateDownload> {
    if (candidate.artifact.size === null || candidate.artifact.sha256 === null) {
      throw new Error('Update artifact size and SHA-256 are required')
    }

    await mkdir(this.downloadDir, { recursive: true })

    const archiveName = readArchiveName(candidate.artifact.url, candidate.info.version)
    const archivePath = join(this.downloadDir, archiveName)
    const temporaryPath = `${archivePath}.download`
    const response = await this.fetchFn(candidate.artifact.url, {
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Update download failed with HTTP ${response.status}`)
    }
    if (!response.body) {
      throw new Error('Update download response did not include a body')
    }

    const expectedBytes = candidate.artifact.size
    const digest = createHash('sha256')
    let transferredBytes = 0
    try {
      const progressStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          transferredBytes += chunk.byteLength
          digest.update(chunk)
          onProgress?.({
            percent: readProgressPercent(transferredBytes, expectedBytes),
            transferredBytes,
            totalBytes: expectedBytes,
          })
          callback(null, chunk)
        },
      })
      const bodyStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
      await pipeline(bodyStream, progressStream, this.writeStreamFactory(temporaryPath))

      const actualSha256 = digest.digest('hex')
      if (transferredBytes !== expectedBytes) {
        throw new Error(`Update archive size verification failed: expected ${expectedBytes} bytes, received ${transferredBytes}`)
      }
      if (actualSha256.toLowerCase() !== candidate.artifact.sha256.toLowerCase()) {
        throw new Error('Update archive SHA-256 verification failed')
      }

      await this.renameFn(temporaryPath, archivePath)
    }
    catch (error) {
      await rm(temporaryPath, { force: true })
      throw error
    }
    onProgress?.({
      percent: 100,
      transferredBytes,
      totalBytes: expectedBytes,
    })

    return {
      artifact: candidate.artifact,
      archivePath,
    }
  }
}

function readArchiveName(url: string, version: string): string {
  const pathName = new URL(url).pathname
  const fileName = basename(pathName)
  if (fileName) {
    return fileName
  }
  return `Cradle-${version}-mac.zip`
}

function readProgressPercent(transferredBytes: number, totalBytes: number | null): number {
  if (!totalBytes || totalBytes <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, (transferredBytes / totalBytes) * 100))
}
