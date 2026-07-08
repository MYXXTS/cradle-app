// Provider-native runtime settings helpers for the chat composer.
import type { TFunction } from 'i18next'

import type { RuntimeCatalogItem } from '~/features/agent-runtime/runtime-catalog'
import type { RuntimeKind } from '~/features/agent-runtime/types'
import {
  listRuntimeSettingsFieldsForRuntime,
  readRuntimeSettingsFormValues,
  type RuntimeSettingsFieldDescriptor,
  type RuntimeSettingsFormValue,
} from '~/features/agent-management/runtime-settings-schema'

import type { RuntimeSettings, RuntimeSettingsPatch } from '../commands/chat-response-command'

export function resolveRuntimeCatalogItem(
  runtimes: RuntimeCatalogItem[],
  runtimeKind: RuntimeKind | null | undefined,
): RuntimeCatalogItem | null {
  if (!runtimeKind) {
    return null
  }
  return runtimes.find(runtime => runtime.runtimeKind === runtimeKind) ?? null
}

export function readComposerRuntimeSettingsFields(
  runtime: RuntimeCatalogItem | null | undefined,
): RuntimeSettingsFieldDescriptor[] {
  return listRuntimeSettingsFieldsForRuntime(runtime)
}

export function readDefaultRuntimeSettings(
  runtime: RuntimeCatalogItem | null | undefined,
): RuntimeSettings {
  const fields = readComposerRuntimeSettingsFields(runtime)
  if (fields.length === 0) {
    return {}
  }
  return readRuntimeSettingsFormValues({}, fields) as RuntimeSettings
}

export function mergeRuntimeSettings(
  base: RuntimeSettings,
  patch: Partial<RuntimeSettings>,
): RuntimeSettings {
  return { ...base, ...patch }
}

export function isPlanRuntimeSettings(settings: RuntimeSettings): boolean {
  return settings.permissionMode === 'plan' || settings.interactionMode === 'plan'
}

/** Exit plan mode using each runtime's native settings shape. */
export function buildExitPlanModePatch(runtimeKind: RuntimeKind | null | undefined): RuntimeSettingsPatch {
  if (runtimeKind === 'claude-agent') {
    return { permissionMode: 'bypassPermissions' }
  }
  return { interactionMode: 'default' }
}

/** Shift+Tab plan toggle using each runtime's native settings shape. */
export function buildPlanModeTogglePatch(
  runtimeKind: RuntimeKind | null | undefined,
  settings: RuntimeSettings,
): RuntimeSettingsPatch | null {
  if (!runtimeKind) {
    return null
  }
  if (runtimeKind === 'claude-agent') {
    return settings.permissionMode === 'plan'
      ? { permissionMode: 'bypassPermissions' }
      : { permissionMode: 'plan' }
  }
  if (runtimeKind === 'codex' || runtimeKind === 'opencode') {
    return settings.interactionMode === 'plan'
      ? { interactionMode: 'default' }
      : { interactionMode: 'plan' }
  }
  return null
}

export function supportsPlanModeToggle(runtimeKind: RuntimeKind | null | undefined): boolean {
  return runtimeKind === 'claude-agent' || runtimeKind === 'codex' || runtimeKind === 'opencode'
}

export function splitRuntimeSettingsSubmitPayload(
  settings: RuntimeSettings & { claudeAgent?: { modelAliases: Record<string, string> } | null },
): {
  runtimeSettings: RuntimeSettings
  claudeAgent?: { modelAliases: Record<string, string> } | null
} {
  const { claudeAgent, ...runtimeSettings } = settings
  if (claudeAgent === undefined) {
    return { runtimeSettings }
  }
  return { runtimeSettings, claudeAgent }
}

export function readRunRuntimeSettingsPatch(
  settings: RuntimeSettings & { claudeAgent?: unknown },
): RuntimeSettings {
  const { claudeAgent: _claudeAgent, ...runtimeSettings } = settings
  return runtimeSettings
}

export function labelRuntimeSettingsValue(
  t: TFunction<'chat'>,
  field: RuntimeSettingsFieldDescriptor,
  value: RuntimeSettingsFormValue,
): string {
  const i18nKey = `runtimeSettings.values.${field.runtimeKind}.${field.key}.${String(value)}`
  const translated = t(i18nKey, { defaultValue: '' })
  if (translated) {
    return translated
  }
  const option = field.enumOptions?.find(item => item.value === value)
  return option?.label ?? String(value)
}

export function formatRuntimeSettingsSummary(
  t: TFunction<'chat'>,
  fields: RuntimeSettingsFieldDescriptor[],
  settings: RuntimeSettings,
): string {
  if (fields.length === 0) {
    return t('runtimeSettings.summary.empty')
  }
  const parts = fields.flatMap((field) => {
    const raw = settings[field.key]
    if (raw === undefined || raw === null) {
      return []
    }
    return [labelRuntimeSettingsValue(t, field, raw as RuntimeSettingsFormValue)]
  })
  return parts.length > 0 ? parts.join(' / ') : t('runtimeSettings.summary.empty')
}

export function readRuntimeSettingsIconKey(
  settings: RuntimeSettings,
  fields: RuntimeSettingsFieldDescriptor[],
): 'plan' | 'approval' | 'full-access' {
  const permissionMode = settings.permissionMode
  if (permissionMode === 'plan') {
    return 'plan'
  }
  const accessMode = settings.accessMode
  if (accessMode === 'approval-required' || permissionMode === 'default') {
    return 'approval'
  }
  return 'full-access'
}
