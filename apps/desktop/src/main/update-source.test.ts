import { describe, expect, it, vi } from 'vitest'

import { DesktopUpdateSource } from './update-source'

function createManifestResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  })
}

describe('desktopUpdateSource', () => {
  it.each([
    'http://updates.example.com/cradle',
    'http://updates.example.com/cradle/macos/manifest.json',
  ])('rejects a non-HTTPS manifest URL before fetching: %s', (updateFeedUrl) => {
    const fetchFn = vi.fn<typeof fetch>()

    expect(() => new DesktopUpdateSource({
      currentVersion: '1.2.2',
      updateFeedUrl,
      fetchFn,
    })).toThrow('Desktop update manifest URL must use HTTPS')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('reads an update candidate from a feed root manifest', async () => {
    const requests: string[] = []
    const source = new DesktopUpdateSource({
      currentVersion: '1.2.2',
      updateFeedUrl: 'https://updates.example.com/cradle',
      fetchFn: async (input) => {
        requests.push(input.toString())
        return createManifestResponse({
          version: '1.2.3',
          releaseName: 'Cradle 1.2.3',
          releaseNotes: 'Update notes',
          releaseDate: '2026-06-20T00:00:00.000Z',
          minSupportedVersion: '1.0.0',
          files: [
            {
              url: 'https://updates.example.com/cradle/macos/Cradle-1.2.3-universal.zip',
              size: 123,
              sha256: 'a'.repeat(64),
              platform: 'darwin',
              arch: 'universal',
            },
          ],
        })
      },
    })

    const candidate = await source.checkForUpdates()

    expect(requests).toEqual(['https://updates.example.com/cradle/macos/manifest.json'])
    expect(candidate?.info).toEqual({
      version: '1.2.3',
      releaseName: 'Cradle 1.2.3',
      releaseNotes: 'Update notes',
      releaseDate: '2026-06-20T00:00:00.000Z',
      files: [
        {
          url: 'https://updates.example.com/cradle/macos/Cradle-1.2.3-universal.zip',
          size: 123,
          sha512: null,
        },
      ],
    })
    expect(candidate?.artifact.sha256).toBe('a'.repeat(64))
  })

  it('returns null when the manifest version is not newer', async () => {
    const source = new DesktopUpdateSource({
      currentVersion: '1.2.3',
      updateFeedUrl: 'https://updates.example.com/cradle/macos/manifest.json',
      fetchFn: async () => createManifestResponse({
        version: '1.2.3',
        files: [
          {
            url: 'https://updates.example.com/cradle/macos/Cradle-1.2.3-universal.zip',
            size: 123,
            sha256: 'a'.repeat(64),
            arch: 'universal',
          },
        ],
      }),
    })

    await expect(source.checkForUpdates()).resolves.toBeNull()
  })

  it('includes the resolved manifest URL when the manifest request fails', async () => {
    const source = new DesktopUpdateSource({
      currentVersion: '1.2.3',
      updateFeedUrl: 'https://updates.example.com/cradle',
      fetchFn: async () => new Response('not found', { status: 404 }),
    })

    await expect(source.checkForUpdates()).rejects.toThrow(
      'Update manifest request failed with HTTP 404: https://updates.example.com/cradle/macos/manifest.json',
    )
  })

  it('accepts SemVer prerelease dev versions', async () => {
    const source = new DesktopUpdateSource({
      currentVersion: '0.0.0-dev.20260620.1',
      updateFeedUrl: 'https://updates.example.com/cradle/manifest.json',
      fetchFn: async () => createManifestResponse({
        version: '0.0.0-dev.20260621.1',
        files: [
          {
            url: 'https://updates.example.com/cradle/Cradle.zip',
            size: 123,
            sha256: 'a'.repeat(64),
            arch: 'universal',
          },
        ],
      }),
    })

    await expect(source.checkForUpdates()).resolves.toMatchObject({
      info: {
        version: '0.0.0-dev.20260621.1',
      },
    })
  })

  it('rejects invalid versions instead of guessing ordering', async () => {
    const source = new DesktopUpdateSource({
      currentVersion: '1.2.3',
      updateFeedUrl: 'https://updates.example.com/cradle/macos/manifest.json',
      fetchFn: async () => createManifestResponse({
        version: '2026.06.invalid',
        files: [
          {
            url: 'https://updates.example.com/cradle/macos/Cradle-1.2.4-universal.zip',
            size: 123,
            sha256: 'a'.repeat(64),
            arch: 'universal',
          },
        ],
      }),
    })

    await expect(source.checkForUpdates()).rejects.toThrow('SemVer-compatible versions')
  })

  it.each([
    [{ url: 'http://updates.example.com/Cradle.zip', size: 123, sha256: 'a'.repeat(64) }, 'must use HTTPS'],
    [{ url: 'https://updates.example.com/Cradle.zip', sha256: 'a'.repeat(64) }, 'size is required'],
    [{ url: 'https://updates.example.com/Cradle.zip', size: 123 }, 'SHA-256 is required'],
  ])('rejects a selected artifact without required integrity metadata', async (artifact, message) => {
    const source = new DesktopUpdateSource({
      currentVersion: '1.2.3',
      updateFeedUrl: 'https://updates.example.com/cradle/manifest.json',
      fetchFn: async () => createManifestResponse({
        version: '1.2.4',
        files: [{ ...artifact, arch: 'universal' }],
      }),
    })

    await expect(source.checkForUpdates()).rejects.toThrow(message)
  })
})
