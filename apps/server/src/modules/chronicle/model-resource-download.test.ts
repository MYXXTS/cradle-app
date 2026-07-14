import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadModelResourceToFile } from './model-resource-download'

const tempRoots: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('chronicle model resource download', () => {
  it('streams an injected response to a caller-owned temporary path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cradle-model-download-'))
    tempRoots.push(root)
    const targetPath = join(root, 'model.onnx.tmp')
    const payload = Buffer.from('model-content')
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(payload, {
      headers: { 'content-length': String(payload.byteLength) },
    }))
    const progress: Array<{ totalBytes: number | null, downloadedBytes: number }> = []

    await downloadModelResourceToFile('https://models.example.com/model.onnx', targetPath, {
      fetchFn,
      timeoutMs: 1000,
      onProgress: entry => progress.push(entry),
    })

    await expect(readFile(targetPath, 'utf8')).resolves.toBe('model-content')
    expect(fetchFn).toHaveBeenCalledWith('https://models.example.com/model.onnx', expect.objectContaining({
      redirect: 'follow',
      signal: expect.any(AbortSignal),
    }))
    expect(progress).toEqual([
      { totalBytes: payload.byteLength, downloadedBytes: 0 },
      { totalBytes: payload.byteLength, downloadedBytes: payload.byteLength },
    ])
  })

  it('aborts a stalled request through fake timers', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn<typeof fetch>(async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const download = downloadModelResourceToFile('https://models.example.com/model.onnx', '/unused', {
      fetchFn,
      timeoutMs: 250,
    })
    const rejection = expect(download).rejects.toThrow('timed out after 250 ms')

    await vi.advanceTimersByTimeAsync(250)

    await rejection
  })

  it('aborts a response body that stalls after headers and cancels the pipeline', async () => {
    vi.useFakeTimers()
    const root = await mkdtemp(join(tmpdir(), 'cradle-model-download-'))
    tempRoots.push(root)
    const targetPath = join(root, 'model.onnx.tmp')
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'))
      },
      cancel,
    })
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(body, {
      headers: { 'content-length': '100' },
    }))
    const download = downloadModelResourceToFile('https://models.example.com/model.onnx', targetPath, {
      fetchFn,
      timeoutMs: 250,
    })
    const rejection = expect(download).rejects.toThrow('timed out after 250 ms')

    await vi.advanceTimersByTimeAsync(250)

    await rejection
    expect(cancel).toHaveBeenCalled()
  })
})
