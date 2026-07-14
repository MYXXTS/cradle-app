import { promises as fsp } from 'node:fs'
import { join, normalize, sep } from 'node:path'

import { AppError } from '../../errors/app-error'
import type { AcpDistributionType, PackageDistribution, RegistryAgent } from './acp.registry'

const AGENT_ID_RE = /^[a-z][a-z0-9-]*$/

export interface InstallResult {
  installPath: string | null
  cmd: string | null
  args: string[]
  env: Record<string, string>
}

export class AcpInstaller {
  getAgentInstallDir(rootDir: string, agentId: string): string {
    assertSafeAgentId(agentId)
    return join(rootDir, 'acp', 'agents', agentId)
  }

  async installBinaryAgent(
    _agent: RegistryAgent,
    _rootDir: string,
    _signal?: AbortSignal,
  ): Promise<InstallResult> {
    throw new AppError({
      code: 'acp_binary_integrity_metadata_missing',
      status: 409,
      message: 'ACP binary installation requires a trusted publisher checksum, but the registry does not provide one',
    })
  }

  installPackageAgent(agent: RegistryAgent, type: Extract<AcpDistributionType, 'npx' | 'uvx'>): InstallResult {
    const spec: PackageDistribution | undefined = type === 'npx' ? agent.distribution.npx : agent.distribution.uvx
    if (!spec) {
      throw new Error(`No ${type} distribution found for agent ${agent.id}`)
    }

    return {
      installPath: null,
      cmd: spec.package,
      args: spec.args,
      env: spec.env,
    }
  }

  async uninstallBinaryAgent(agentId: string, installPath: string, rootDir: string): Promise<void> {
    const expectedPrefix = join(rootDir, 'acp', 'agents') + sep
    const normalized = normalize(installPath)
    if (!normalized.startsWith(expectedPrefix)) {
      throw new Error(`Refusing to delete path outside of ${expectedPrefix}: ${installPath}`)
    }
    assertSafeAgentId(agentId)
    await fsp.rm(installPath, { recursive: true, force: true })
  }
}

function assertSafeAgentId(agentId: string): void {
  if (!AGENT_ID_RE.test(agentId)) {
    throw new Error(`Unsafe agent ID: ${JSON.stringify(agentId)}`)
  }
}
