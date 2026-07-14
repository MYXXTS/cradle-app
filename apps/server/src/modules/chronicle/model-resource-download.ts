import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { AppError } from '../../errors/app-error'

export interface ModelResourceDownloadProgress {
  totalBytes: number | null
  downloadedBytes: number
}

export interface ModelResourceDownloadOptions {
  fetchFn?: typeof fetch
  timeoutMs: number
  onProgress?: (progress: ModelResourceDownloadProgress) => void
}

export async function downloadModelResourceToFile(
  sourceUrl: string,
  targetPath: string,
  options: ModelResourceDownloadOptions,
): Promise<ModelResourceDownloadProgress> {
  const parsed = new URL(sourceUrl)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError({
      code: 'chronicle_model_resource_url_invalid',
      status: 400,
      message: 'Model resource URL must use http or https',
    })
  }

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | null = null
  const refreshTimeout = (): void => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  }
  refreshTimeout()
  let response: Response
  try {
    response = await (options.fetchFn ?? fetch)(sourceUrl, {
      headers: { 'User-Agent': 'Cradle/1.0' },
      redirect: 'follow',
      signal: controller.signal,
    })
    refreshTimeout()

    if (!response.ok) {
      throw new Error(`Model resource download failed: ${response.status} ${response.statusText}`)
    }
    if (!response.body) {
      throw new Error('Model resource download returned no body')
    }

    const contentLength = response.headers.get('content-length')
    const totalBytes = contentLength ? Number.parseInt(contentLength, 10) : null
    options.onProgress?.({ totalBytes, downloadedBytes: 0 })

    const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
    const fileStream = createWriteStream(targetPath)
    let downloadedBytes = 0
    nodeStream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length
      refreshTimeout()
      options.onProgress?.({ totalBytes, downloadedBytes })
    })
    await pipeline(nodeStream, fileStream, { signal: controller.signal })
    return { totalBytes, downloadedBytes }
  }
  catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Model resource download timed out after ${options.timeoutMs} ms`)
    }
    throw error
  }
  finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}
