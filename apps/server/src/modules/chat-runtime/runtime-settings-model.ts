import { t } from 'elysia'

export const runtimeSettingsValueSchema = t.Union([
  t.String(),
  t.Number(),
  t.Boolean(),
])

export const runtimeSettingsSchema = t.Record(t.String(), runtimeSettingsValueSchema)

export const runtimeSettingsPatchSchema = t.Record(t.String(), t.Union([
  runtimeSettingsValueSchema,
  t.Null(),
]))

export const claudeAgentConfigPatchSchema = t.Object({
  modelAliases: t.Optional(t.Object({
    haiku: t.Optional(t.String()),
    sonnet: t.Optional(t.String()),
    opus: t.Optional(t.String()),
  }, { additionalProperties: false })),
}, { additionalProperties: false })

/** Session/runtime patch that may include provider-native settings plus Claude alias config. */
export const sessionRuntimeSettingsPatchSchema = t.Object({
  claudeAgent: t.Optional(t.Union([
    claudeAgentConfigPatchSchema,
    t.Null(),
  ])),
}, {
  additionalProperties: t.Union([
    runtimeSettingsValueSchema,
    t.Null(),
  ]),
})

export const claudeAgentModelAliasesSchema = t.Object({
  haiku: t.String(),
  sonnet: t.String(),
  opus: t.String(),
}, { additionalProperties: false })

export const sessionClaudeAgentConfigSchema = t.Object({
  modelAliases: claudeAgentModelAliasesSchema,
}, { additionalProperties: false })
