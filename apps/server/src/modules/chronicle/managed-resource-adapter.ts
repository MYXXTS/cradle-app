import { AppError } from '../../errors/app-error'
import type {
  ManagedResourceAction,
  ManagedResourceAdapter,
  ManagedResourceDeclaration,
  ManagedResourceKey,
  ManagedResourceProjection,
} from '../managed-resources/service'
import type {
  ChronicleModelResourceDeclaration,
  ModelResourceDownloadCenter,
  ModelResourceEntry,
} from './service'
import {
  getModelResourceDeclarations,
  getModelResources,
  installModelResource,
  removeModelResource,
} from './service'

function enabled(): ManagedResourceAction {
  return { available: true, reasonCode: null }
}

function disabled(reasonCode: string): ManagedResourceAction {
  return { available: false, reasonCode }
}

function managedDeclaration(
  declaration: ChronicleModelResourceDeclaration,
): ManagedResourceDeclaration {
  return {
    key: declaration.key,
    displayName: declaration.displayName,
    description: declaration.description,
    kind: declaration.kind,
    required: declaration.required,
  }
}

function projectEntry(
  declaration: ChronicleModelResourceDeclaration,
  entry: ModelResourceEntry,
): ManagedResourceProjection {
  const ready = entry.status === 'available' || entry.status === 'installed'
  const state = entry.status === 'available' || entry.status === 'installed'
    ? 'installed'
    : entry.status === 'missing'
      ? 'not-installed'
      : entry.status
  const installAvailable = declaration.manifestInstallable
    && entry.status !== 'installing'
    && !ready
  const uninstallAvailable = declaration.fileBacked
    && entry.status !== 'installing'
    && entry.status !== 'missing'

  return {
    state,
    installationSource: declaration.fileBacked
      ? ready || entry.status === 'installing' || (entry.sizeBytes ?? 0) > 0 ? 'managed' : null
      : 'built-in',
    installedVersion: ready ? entry.version : null,
    availableVersion: declaration.availableVersion,
    installedSizeBytes: entry.sizeBytes,
    downloadSizeBytes: declaration.downloadSizeBytes,
    actions: {
      install: installAvailable
        ? enabled()
        : disabled(declaration.manifestInstallable
            ? ready ? 'managed_resource_already_installed' : 'managed_resource_install_in_progress'
            : 'managed_resource_install_unavailable'),
      update: disabled('managed_resource_update_unavailable'),
      uninstall: uninstallAvailable
        ? enabled()
        : disabled(declaration.fileBacked
            ? entry.status === 'installing' ? 'managed_resource_install_in_progress' : 'managed_resource_not_installed'
            : 'managed_resource_built_in'),
    },
  }
}

export function createChronicleManagedResourceAdapter(
  downloadCenter?: ModelResourceDownloadCenter,
): ManagedResourceAdapter {
  const declarations = getModelResourceDeclarations()
  const declarationById = new Map<string, ChronicleModelResourceDeclaration>(
    declarations.map(declaration => [declaration.key.resourceId, declaration]),
  )

  function requireDeclaration(key: ManagedResourceKey): ChronicleModelResourceDeclaration {
    const declaration = key.namespace === 'chronicle' && key.resourceType === 'model-resource'
      ? declarationById.get(key.resourceId)
      : undefined
    if (!declaration) {
      throw new AppError({
        code: 'chronicle_model_resource_not_found',
        status: 404,
        message: 'Chronicle model resource was not found.',
      })
    }
    return declaration
  }

  async function project(key: ManagedResourceKey): Promise<ManagedResourceProjection> {
    const declaration = requireDeclaration(key)
    const entries = await getModelResources()
    const entry = entries.find(candidate => candidate.category === declaration.key.resourceId)
    if (!entry) {
      throw new AppError({
        code: 'chronicle_model_resource_not_found',
        status: 404,
        message: 'Chronicle model resource was not found.',
      })
    }
    return projectEntry(declaration, entry)
  }

  return {
    namespace: 'chronicle',
    declarations: () => declarations.map(managedDeclaration),
    project,
    async execute(key, action) {
      const declaration = requireDeclaration(key)
      if (action === 'install') {
        const entry = await installModelResource(
          declaration.key.resourceId,
          { source: 'manifest' },
          downloadCenter,
        )
        return projectEntry(declaration, entry)
      }
      if (action === 'uninstall') {
        const entry = await removeModelResource(declaration.key.resourceId)
        return projectEntry(declaration, entry)
      }
      throw new AppError({
        code: 'managed_resource_update_unavailable',
        status: 409,
        message: 'Chronicle model resources do not support managed updates.',
      })
    },
  }
}
