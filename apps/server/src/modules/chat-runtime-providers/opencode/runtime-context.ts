/**
 * Output: opencode SDK server host resource.
 * Input: opencode native config and Cradle runtime host key.
 * Position: opencode provider package runtime process owner.
 *
 * opencode `serve` is a stateless multiplexer: `directory`, `model` and config
 * are all carried per request, sessions coexist globally, and config can be
 * hot-updated per directory via `POST /config?directory=...`. One long-lived
 * server therefore serves every Cradle chat session, workspace and provider
 * target. Cradle owns that single server's lifecycle (started at app boot,
 * stopped on shutdown); per-session process spawning and the host-manager
 * lease/reaper machinery do not apply here.
 *
 * The server is spawned directly (rather than via the SDK's `createOpencode`)
 * so Cradle retains the `ChildProcess` and can report its pid/RSS/CPU to the
 * Resource Panel and Grafana. The HTTP client is still built with the SDK's
 * `createOpencodeClient`.
 */

import type { ChildProcess } from 'node:child_process'
import { execSync, spawn } from 'node:child_process'
import net from 'node:net'

import type { Config, OpencodeClient } from '@opencode-ai/sdk'
import { createOpencodeClient } from '@opencode-ai/sdk'

import { createChildLogger } from '../../../logging/logger'
import type { RuntimeLiveResourceLease } from '../../chat-runtime/runtime-provider-types'
import type { RuntimeKind } from '../../provider-contracts/types'

const logger = createChildLogger({ module: 'chat-runtime.opencode-server' })

const SERVER_STARTUP_TIMEOUT_MS = 5000
const SERVER_LISTENING_PATTERN = /on\s+(https?:\/\/\S+)/
const PROCESS_RESOURCE_FIELD_SEPARATOR_PATTERN = /\s+/

export interface OpencodeRuntimeResource {
  client: OpencodeClient
  server: {
    url: string
    close: () => void
  }
}

interface OpencodeServerInstance {
  client: OpencodeClient
  process: ChildProcess
  url: string
  startedAt: number
  close: () => void
}

interface OpencodeServerResources {
  running: boolean
  pid: number | null
  url: string | null
  startedAt: number | null
  uptimeSeconds: number | null
  rssMB: number | null
  cpuPercent: number | null
}

let instancePromise: Promise<OpencodeServerInstance> | null = null

/**
 * Start the shared opencode server (idempotent). Resolves to the same instance
 * for every caller. If startup fails the cached promise is cleared so the next
 * call retries instead of replaying the failure forever.
 */
export async function startOpencodeServer(): Promise<OpencodeServerInstance> {
  if (!instancePromise) {
    instancePromise = spawnOpencodeServerInstance().catch((error) => {
      instancePromise = null
      throw error
    })
  }
  return await instancePromise
}

/** Resolve the shared opencode server, starting it lazily if needed. */
export async function getOpencodeServer(): Promise<OpencodeServerInstance> {
  return await startOpencodeServer()
}

/** Stop the shared opencode server, if one is running. Safe to call when idle. */
export async function stopOpencodeServer(): Promise<void> {
  const pending = instancePromise
  instancePromise = null
  if (!pending) {
    return
  }
  try {
    const instance = await pending
    instance.close()
    logger.info('opencode server stopped')
  }
  catch (error) {
    logger.warn('opencode server stop failed', { error: formatError(error) })
  }
}

/**
 * Snapshot the shared opencode server process for the Resource Panel and
 * Grafana. RSS/CPU come from `ps` against the server pid (same approach as the
 * Chronicle daemon). When the server is not running, or `ps` is unavailable,
 * the resource fields degrade to `null` while still reporting `running`/`pid`.
 */
export function getOpencodeServerResources(): OpencodeServerResources {
  const instance = currentInstance()
  const pid = instance?.process.pid ?? null
  if (!instance || !pid) {
    return {
      running: false,
      pid: null,
      url: null,
      startedAt: null,
      uptimeSeconds: null,
      rssMB: null,
      cpuPercent: null,
    }
  }

  const now = Date.now()
  const uptimeSeconds = Math.max(0, Math.floor((now - instance.startedAt) / 1000))
  const usage = readProcessResourceUsage(pid)
  return {
    running: true,
    pid,
    url: instance.url,
    startedAt: instance.startedAt,
    uptimeSeconds,
    rssMB: usage?.rssMB ?? null,
    cpuPercent: usage?.cpuPercent ?? null,
  }
}

function currentInstance(): OpencodeServerInstance | null {
  // The cached promise resolves to the live instance; if startup is still in
  // flight or has failed there is nothing to sample yet.
  if (!instancePromise) {
    return null
  }
  // The instance is only reachable synchronously once spawned. We peek via a
  // module-level slot updated when the process is born.
  return spawnedInstance
}

let spawnedInstance: OpencodeServerInstance | null = null

async function spawnOpencodeServerInstance(): Promise<OpencodeServerInstance> {
  const port = await findAvailablePort()
  const { process: proc, url } = await launchOpencodeServer(port)
  const client = createOpencodeClient({ baseUrl: url })
  const startedAt = Date.now()
  const instance: OpencodeServerInstance = {
    client,
    process: proc,
    url,
    startedAt,
    close: () => {
      stopProcess(proc)
    },
  }
  spawnedInstance = instance
  proc.once('exit', (code, signal) => {
    logger.warn('opencode server exited', { code, signal })
    if (spawnedInstance === instance) {
      spawnedInstance = null
      instancePromise = null
    }
  })
  logger.info('opencode server started', { url, port, pid: proc.pid })
  return instance
}

function launchOpencodeServer(port: number): Promise<{ process: ChildProcess, url: string }> {
  return new Promise((resolve, reject) => {
    const args = ['serve', `--hostname=127.0.0.1`, `--port=${port}`]
    const proc = spawn('opencode', args, {
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify({}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    let settled = false
    const startupTimeout = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      stopProcess(proc)
      reject(new Error(`Timeout waiting for opencode server to start after ${SERVER_STARTUP_TIMEOUT_MS}ms`))
    }, SERVER_STARTUP_TIMEOUT_MS)

    const onLine = (line: string): void => {
      if (settled) {
        return
      }
      if (line.startsWith('opencode server listening')) {
        const match = line.match(SERVER_LISTENING_PATTERN)
        if (!match) {
          settled = true
          clearTimeout(startupTimeout)
          stopProcess(proc)
          reject(new Error(`Failed to parse opencode server url from output: ${line}`))
          return
        }
        settled = true
        clearTimeout(startupTimeout)
        resolve({ process: proc, url: match[1] })
      }
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      for (const line of output.split('\n')) {
        onLine(line)
      }
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    proc.on('exit', (code, signal) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(startupTimeout)
      let message = `opencode server exited before listening (code ${code}, signal ${signal})`
      if (output.trim()) {
        message += `\nServer output: ${output.trim()}`
      }
      reject(new Error(message))
    })
    proc.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(startupTimeout)
      reject(error)
    })
  })
}

function stopProcess(proc: ChildProcess): void {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return
  }
  proc.kill('SIGTERM')
}

function readProcessResourceUsage(pid: number): { rssMB: number, cpuPercent: number } | null {
  try {
    const output = execSync(`ps -o rss=,pcpu= -p ${pid}`, { encoding: 'utf8', timeout: 1000 }).trim()
    const [rssRaw, cpuRaw] = output.split(PROCESS_RESOURCE_FIELD_SEPARATOR_PATTERN)
    const rssMB = Number.parseInt(rssRaw, 10) / 1024
    const cpuPercent = Number.parseFloat(cpuRaw)
    if (!Number.isFinite(rssMB) || rssMB < 0 || !Number.isFinite(cpuPercent) || cpuPercent < 0) {
      return null
    }
    return {
      rssMB: Math.round(rssMB * 100) / 100,
      cpuPercent: Math.round(cpuPercent * 100) / 100,
    }
  }
  catch {
    return null
  }
}

/**
 * Install a Cradle provider target's opencode config into the given workspace
 * directory on the shared server. opencode scopes config per directory; we
 * read-modify-write so multiple provider targets (namespaced by `cradle-*`
 * provider IDs) coexist instead of clobbering each other. The native target
 * (no projected `provider` entries) is left to opencode's own user config.
 *
 * Redundant installs for an unchanged directory+target are skipped via a
 * fingerprint cache, so reconnects/resumes do not replay the round trip.
 */
export async function ensureOpencodeDirectoryConfig(input: {
  directory: string
  providerTargetId: string | null
  config: Config
}): Promise<void> {
  const incomingProvider = input.config.provider
  if (!incomingProvider) {
    return
  }

  const fingerprintKey = `${input.directory}::${input.providerTargetId ?? 'native'}`
  const incomingJson = JSON.stringify(incomingProvider)
  if (directoryConfigFingerprints.get(fingerprintKey) === incomingJson) {
    return
  }

  const { client } = await getOpencodeServer()
  try {
    const existing = await client.config.get({ query: { directory: input.directory } })
    if (existing.error) {
      logger.warn('opencode config.get failed', {
        directory: input.directory,
        error: formatError(existing.error),
      })
      return
    }
    const base = (existing.data ?? {}) as Config
    const merged: Config = {
      ...base,
      provider: {
        ...(base.provider ?? {}),
        ...incomingProvider,
      },
    }
    const result = await client.config.update({
      query: { directory: input.directory },
      body: merged,
    })
    if (result.error) {
      logger.warn('opencode config.update failed', {
        directory: input.directory,
        error: formatError(result.error),
      })
      return
    }
    directoryConfigFingerprints.set(fingerprintKey, incomingJson)
  }
  catch (error) {
    logger.warn('opencode directory config ensure failed', {
      directory: input.directory,
      error: formatError(error),
    })
  }
}

const directoryConfigFingerprints = new Map<string, string>()

/**
 * Acquire the shared opencode server resource. The returned lease is a no-op:
 * the server outlives every session, so `release()` does not tear anything
 * down. The signature is preserved so callers can keep treating it as a
 * host-managed lease.
 *
 * When `directory` is provided alongside a config that projects `provider`
 * entries, the target's config is installed into that directory first.
 */
export async function acquireOpencodeRuntimeResource(input: {
  runtimeKind: RuntimeKind
  providerTargetId: string
  chatSessionId: string
  config: Config
  directory?: string
}): Promise<RuntimeLiveResourceLease<OpencodeRuntimeResource>> {
  if (input.directory) {
    await ensureOpencodeDirectoryConfig({
      directory: input.directory,
      providerTargetId: input.providerTargetId,
      config: input.config,
    })
  }
  const instance = await getOpencodeServer()
  const resource: OpencodeRuntimeResource = {
    client: instance.client,
    server: {
      url: instance.url,
      close: () => instance.close(),
    },
  }
  return createSharedLease(resource)
}

function createSharedLease(resource: OpencodeRuntimeResource): RuntimeLiveResourceLease<OpencodeRuntimeResource> {
  return {
    resource,
    refresh() {},
    release() {},
  }
}

async function findAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate opencode server port')))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return JSON.stringify(error)
}
