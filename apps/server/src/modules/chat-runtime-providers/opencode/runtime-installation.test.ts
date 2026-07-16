import { mkdtempSync, rmSync } from 'node:fs'
import { chmod, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { DownloadedArtifact, DownloadRequest } from '@cradle/download-center'
import { create as createTar } from 'tar'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OpencodeRuntimeDownloadCenter } from './runtime-installation'
import {
  checkOpencodeRuntimeHealth,
  extractOpencodeExecutable,
  OpencodeRuntimeInstallationService,
  probeOpencodeVersion,
  resolveOpencodeExecutable,
  validateOpencodeArchivePath,
} from './runtime-installation'
import { resolveOpencodeReleaseTarget } from './runtime-release'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'cradle-opencode-runtime-'))
  tempRoots.push(root)
  return root
}

function fakeDownloadCenter() {
  const requests: DownloadRequest[] = []
  const retryRequests: DownloadRequest[] = []
  const artifact: DownloadedArtifact = {
    taskId: 'task-1',
    filePath: '/fake/opencode.zip',
    bytes: 1,
    checksum: { algorithm: 'sha256', expected: null, actual: 'a'.repeat(64), matched: null },
  }
  const service: OpencodeRuntimeDownloadCenter = {
    execute: vi.fn(async (request) => {
      requests.push(request)
      return artifact
    }),
    retry: vi.fn(async (_taskId, request) => {
      retryRequests.push(request)
      return artifact
    }),
    release: vi.fn(async () => undefined),
    findLatestRetryable: vi.fn(() => null),
  }
  return { service, requests, retryRequests }
}

describe('opencodeRuntimeInstallationService', () => {
  it('installs the pinned target atomically with the catalog identity and removes only managed files', async () => {
    const rootDir = tempRoot()
    const pathDir = tempRoot()
    const pathExecutable = path.join(pathDir, 'opencode')
    await writeFile(pathExecutable, 'external')
    await chmod(pathExecutable, 0o755)
    const target = resolveOpencodeReleaseTarget({ platform: 'darwin', arch: 'arm64' })!
    const download = fakeDownloadCenter()
    const prepareRemoval = vi.fn(async () => true)
    const service = new OpencodeRuntimeInstallationService({
      downloadCenter: download.service,
      rootDir,
      env: { PATH: pathDir },
      target,
      probeVersion: vi.fn(async () => target.version),
      prepareManagedPathForRemoval: prepareRemoval,
      extractExecutable: async (_archive, selectedTarget, destination) => {
        const executable = path.join(destination, selectedTarget.executableName)
        await mkdir(destination, { recursive: true })
        await writeFile(executable, 'fixture')
        return executable
      },
      now: () => new Date('2026-07-16T00:00:00.000Z'),
    })
    await service.boot()

    await expect(service.install()).resolves.toMatchObject({
      state: 'ready',
      source: 'managed',
      version: target.version,
      managedInstalled: true,
    })
    expect(download.requests[0]).toMatchObject({
      owner: { namespace: 'opencode', resourceType: 'runtime', resourceId: 'cli' },
      fileName: target.assetName,
      integrity: { expectedBytes: target.sizeBytes, checksum: { value: target.sha256 } },
      maxBytes: target.sizeBytes,
    })
    expect(download.service.release).toHaveBeenCalledWith('task-1')
    expect(resolveOpencodeExecutable({ rootDir, env: { PATH: pathDir } }))
      .toMatchObject({ source: 'managed', version: target.version, managed: true })

    await expect(service.uninstall()).resolves.toMatchObject({
      managedInstalled: false,
      source: 'path',
      state: 'ready',
    })
    expect(prepareRemoval).toHaveBeenCalledOnce()
  })

  it('coalesces installs, preserves configured overrides, and blocks active-runtime removal', async () => {
    const target = resolveOpencodeReleaseTarget({ platform: 'darwin', arch: 'arm64' })!
    const override = new OpencodeRuntimeInstallationService({
      downloadCenter: fakeDownloadCenter().service,
      rootDir: tempRoot(),
      env: { CRADLE_OPENCODE_PATH: '/operator/opencode', PATH: '' },
      target,
    })
    expect(() => override.install()).toThrow(expect.objectContaining({ code: 'opencode_runtime_override_active' }))

    const rootDir = tempRoot()
    const download = fakeDownloadCenter()
    let finishExtraction: (() => void) | null = null
    const extraction = new Promise<void>((resolve) => { finishExtraction = resolve })
    const service = new OpencodeRuntimeInstallationService({
      downloadCenter: download.service,
      rootDir,
      env: { PATH: '' },
      target,
      probeVersion: vi.fn(async () => target.version),
      prepareManagedPathForRemoval: vi.fn(async () => false),
      extractExecutable: async (_archive, selectedTarget, destination) => {
        await extraction
        const executable = path.join(destination, selectedTarget.executableName)
        await mkdir(destination, { recursive: true })
        await writeFile(executable, 'fixture')
        return executable
      },
    })
    await service.boot()
    const first = service.install()
    const second = service.install()
    expect(second).toBe(first)
    finishExtraction!()
    await first
    await expect(service.uninstall()).rejects.toMatchObject({ code: 'opencode_runtime_in_use' })
  })

  it('releases the Download Center artifact and retains error state when extraction fails', async () => {
    const target = resolveOpencodeReleaseTarget({ platform: 'darwin', arch: 'arm64' })!
    const download = fakeDownloadCenter()
    const service = new OpencodeRuntimeInstallationService({
      downloadCenter: download.service,
      rootDir: tempRoot(),
      env: { PATH: '' },
      target,
      extractExecutable: vi.fn(async () => { throw new Error('unsafe archive') }),
    })
    await service.boot()
    await expect(service.install()).rejects.toThrow('unsafe archive')
    expect(download.service.release).toHaveBeenCalledWith('task-1')
    await expect(service.status()).resolves.toMatchObject({
      state: 'error',
      errorCode: 'opencode_runtime_install_failed',
    })
  })

  it('blocks uninstall while any side-by-side managed version still has a lease', async () => {
    const rootDir = tempRoot()
    const target = resolveOpencodeReleaseTarget({ platform: 'darwin', arch: 'arm64' })!
    const oldExecutable = path.join(rootDir, 'versions', '1.16.0', 'bin', 'opencode')
    const prepareRemoval = vi.fn(async (binaryPath: string) => binaryPath !== oldExecutable)
    const service = new OpencodeRuntimeInstallationService({
      downloadCenter: fakeDownloadCenter().service,
      rootDir,
      env: { PATH: '' },
      target,
      probeVersion: vi.fn(async () => target.version),
      prepareManagedPathForRemoval: prepareRemoval,
      extractExecutable: async (_archive, selectedTarget, destination) => {
        const executable = path.join(destination, selectedTarget.executableName)
        await mkdir(destination, { recursive: true })
        await writeFile(executable, 'fixture')
        return executable
      },
    })
    await service.boot()
    await service.install()
    await mkdir(path.dirname(oldExecutable), { recursive: true })
    await writeFile(oldExecutable, 'old')
    await writeFile(path.join(rootDir, 'versions', '1.16.0', 'installation.json'), JSON.stringify({
      schemaVersion: 1,
      version: '1.16.0',
      releaseTag: 'v1.16.0',
      targetKey: target.key,
      executablePath: 'versions/1.16.0/bin/opencode',
      sha256: 'b'.repeat(64),
      installedAt: '2026-07-15T00:00:00.000Z',
    }))

    await expect(service.uninstall()).rejects.toMatchObject({ code: 'opencode_runtime_in_use' })
    expect(prepareRemoval).toHaveBeenCalledWith(oldExecutable)
  })

  it('reuses an exact retryable transfer and does not overwrite an orphaned immutable version', async () => {
    const rootDir = tempRoot()
    const target = resolveOpencodeReleaseTarget({ platform: 'darwin', arch: 'arm64' })!
    const download = fakeDownloadCenter()
    vi.mocked(download.service.findLatestRetryable).mockReturnValue({
      taskId: 'retry-task',
      updatedAt: '2026-07-16T00:00:00.000Z',
    })
    await mkdir(path.join(rootDir, 'versions', target.version), { recursive: true })
    await writeFile(path.join(rootDir, 'versions', target.version, 'orphan'), 'preserve')
    const service = new OpencodeRuntimeInstallationService({
      downloadCenter: download.service,
      rootDir,
      env: { PATH: '' },
      target,
      probeVersion: vi.fn(async () => target.version),
      extractExecutable: async (_archive, selectedTarget, destination) => {
        const executable = path.join(destination, selectedTarget.executableName)
        await mkdir(destination, { recursive: true })
        await writeFile(executable, 'fixture')
        return executable
      },
    })

    await expect(service.install()).rejects.toMatchObject({ code: 'opencode_runtime_install_conflict' })
    expect(download.service.retry).toHaveBeenCalledWith('retry-task', expect.any(Object))
    expect(download.service.execute).not.toHaveBeenCalled()
    expect(download.retryRequests[0]?.owner).toEqual({
      namespace: 'opencode',
      resourceType: 'runtime',
      resourceId: 'cli',
      displayName: 'OpenCode CLI',
    })
    await expect(readFile(path.join(rootDir, 'versions', target.version, 'orphan'), 'utf8')).resolves.toBe('preserve')
  })
})

describe('openCode archive validation', () => {
  it.each([
    '../opencode',
    '/tmp/opencode',
    'C:\\temp\\opencode.exe',
    `nested/${String.fromCharCode(0)}/opencode`,
  ])('rejects unsafe entry path %j', (entryPath) => {
    expect(() => validateOpencodeArchivePath(entryPath)).toThrow(expect.objectContaining({
      code: 'opencode_runtime_archive_invalid',
    }))
  })

  it('extracts one regular CLI and rejects duplicate, missing, and symlink entries', async () => {
    const target = resolveOpencodeReleaseTarget({ platform: 'linux', arch: 'x64', libc: 'glibc' })!

    const validRoot = tempRoot()
    await mkdir(path.join(validRoot, 'source', 'nested'), { recursive: true })
    await writeFile(path.join(validRoot, 'source', 'nested', 'opencode'), 'valid')
    const validArchive = path.join(validRoot, 'valid.tar.gz')
    await createTar({ cwd: path.join(validRoot, 'source'), file: validArchive, gzip: true }, ['nested/opencode'])
    const extracted = await extractOpencodeExecutable(validArchive, target, path.join(validRoot, 'extract'))
    await expect(readFile(extracted, 'utf8')).resolves.toBe('valid')

    const duplicateRoot = tempRoot()
    await mkdir(path.join(duplicateRoot, 'source', 'a'), { recursive: true })
    await mkdir(path.join(duplicateRoot, 'source', 'b'), { recursive: true })
    await writeFile(path.join(duplicateRoot, 'source', 'a', 'opencode'), 'a')
    await writeFile(path.join(duplicateRoot, 'source', 'b', 'opencode'), 'b')
    const duplicateArchive = path.join(duplicateRoot, 'duplicate.tar.gz')
    await createTar({ cwd: path.join(duplicateRoot, 'source'), file: duplicateArchive, gzip: true }, ['a/opencode', 'b/opencode'])
    await expect(extractOpencodeExecutable(duplicateArchive, target, path.join(duplicateRoot, 'extract')))
      .rejects
.toMatchObject({ code: 'opencode_runtime_archive_invalid' })

    const missingRoot = tempRoot()
    await writeFile(path.join(missingRoot, 'readme.txt'), 'not executable')
    const missingArchive = path.join(missingRoot, 'missing.tar.gz')
    await createTar({ cwd: missingRoot, file: missingArchive, gzip: true }, ['readme.txt'])
    await expect(extractOpencodeExecutable(missingArchive, target, path.join(missingRoot, 'extract')))
      .rejects
.toMatchObject({ code: 'opencode_runtime_archive_invalid' })

    if (process.platform !== 'win32') {
      const linkRoot = tempRoot()
      await writeFile(path.join(linkRoot, 'target'), 'target')
      await symlink('target', path.join(linkRoot, 'opencode'))
      const linkArchive = path.join(linkRoot, 'link.tar.gz')
      await createTar({ cwd: linkRoot, file: linkArchive, gzip: true }, ['opencode'])
      await expect(extractOpencodeExecutable(linkArchive, target, path.join(linkRoot, 'extract')))
        .rejects
.toMatchObject({ code: 'opencode_runtime_archive_invalid' })
    }
  })
})

describe('openCode executable resolution and health', () => {
  it('uses configured, managed, PATH, then a stable missing result without exposing paths', async () => {
    const configuredDir = tempRoot()
    const configuredPath = path.join(configuredDir, 'configured-opencode')
    const pathDir = tempRoot()
    const pathExecutable = path.join(pathDir, 'opencode')
    await writeFile(configuredPath, 'configured')
    await writeFile(pathExecutable, 'path')
    await chmod(configuredPath, 0o755)
    await chmod(pathExecutable, 0o755)

    expect(resolveOpencodeExecutable({
      env: { CRADLE_OPENCODE_PATH: configuredPath, PATH: pathDir },
      rootDir: tempRoot(),
    })).toMatchObject({ source: 'configured', command: configuredPath, managed: false })
    expect(resolveOpencodeExecutable({ env: { PATH: pathDir }, rootDir: tempRoot() }))
      .toMatchObject({ source: 'path', command: pathExecutable, managed: false })
    expect(() => resolveOpencodeExecutable({ env: { PATH: '' }, rootDir: tempRoot() }))
      .toThrow(expect.objectContaining({ code: 'opencode_runtime_not_installed' }))

    const probeVersion = vi.fn(async () => '1.17.11')
    const health = await checkOpencodeRuntimeHealth({
      env: { CRADLE_OPENCODE_PATH: configuredPath, PATH: '' },
      rootDir: tempRoot(),
      probeVersion,
    })
    expect(health).toMatchObject({ status: 'healthy', message: 'OpenCode CLI 1.17.11 is available from configured.' })
    expect(health.message).not.toContain(configuredDir)
    await expect(checkOpencodeRuntimeHealth({ env: { PATH: '' }, rootDir: tempRoot() }))
      .resolves
.toMatchObject({ status: 'unhealthy', message: 'OpenCode CLI is not installed. Install it from Resources.' })
  })

  it('rejects malformed version output through the bounded probe', async () => {
    if (process.platform === 'win32') {
      return
    }
    const executable = path.join(tempRoot(), 'opencode-invalid-version')
    await writeFile(executable, '#!/bin/sh\nprintf "not-a-version\\n"\n')
    await chmod(executable, 0o755)
    await expect(probeOpencodeVersion(executable)).rejects.toMatchObject({ code: 'opencode_runtime_probe_failed' })
  })
})
