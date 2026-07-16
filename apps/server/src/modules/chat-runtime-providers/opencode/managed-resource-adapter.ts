import type {
  ManagedResourceAction,
  ManagedResourceAdapter,
  ManagedResourceProjection,
} from '../../managed-resources/service'
import type {
  OpencodeRuntimeInstallationService,
  OpencodeRuntimeStatus,
} from './runtime-installation'

export type OpencodeManagedResourceInstallation = Pick<
  OpencodeRuntimeInstallationService,
  'status' | 'install' | 'uninstall'
>

function enabled(): ManagedResourceAction {
  return { available: true, reasonCode: null }
}

function disabled(reasonCode: string): ManagedResourceAction {
  return { available: false, reasonCode }
}

function projectStatus(status: OpencodeRuntimeStatus): ManagedResourceProjection {
  const configured = status.source === 'configured'
  const managed = status.source === 'managed'
  const external = status.source === 'configured' || status.source === 'path'
  const installing = status.state === 'installing'
  const unavailable = status.state === 'unavailable'
  const installAvailable = !configured
    && !managed
    && !installing
    && !unavailable
  const updateAvailable = status.state === 'update-available' && managed
  const uninstallAvailable = status.managedInstalled && !installing

  return {
    state: status.state === 'ready'
      ? 'installed'
      : status.state === 'missing'
        ? 'not-installed'
        : status.state,
    installationSource: managed ? 'managed' : external ? 'external' : null,
    installedVersion: status.version,
    availableVersion: status.targetVersion,
    installedSizeBytes: status.installedSizeBytes,
    downloadSizeBytes: status.downloadSizeBytes,
    actions: {
      install: installAvailable
        ? enabled()
        : disabled(configured
            ? 'opencode_runtime_override_active'
            : managed
? 'managed_resource_already_installed'
              : installing
? 'opencode_runtime_install_in_progress'
                : 'opencode_runtime_target_unsupported'),
      update: updateAvailable
        ? enabled()
        : disabled(installing ? 'opencode_runtime_install_in_progress' : 'managed_resource_update_unavailable'),
      uninstall: uninstallAvailable
        ? enabled()
        : disabled(installing
            ? 'opencode_runtime_install_in_progress'
            : status.managedInstalled ? 'opencode_runtime_in_use' : 'managed_resource_not_installed'),
    },
  }
}

export function createOpencodeManagedResourceAdapter(
  installation: OpencodeManagedResourceInstallation,
): ManagedResourceAdapter {
  return {
    namespace: 'opencode',
    declarations: () => [{
      key: { namespace: 'opencode', resourceType: 'runtime', resourceId: 'cli' },
      displayName: 'OpenCode CLI',
      description: 'Optional OpenCode command-line runtime managed by Cradle.',
      kind: 'runtime',
      required: false,
    }],
    async project() {
      return projectStatus(await installation.status())
    },
    async execute(_key, action) {
      if (action === 'uninstall') {
        return projectStatus(await installation.uninstall())
      }
      return projectStatus(await installation.install())
    },
  }
}
