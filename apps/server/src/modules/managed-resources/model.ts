import { t } from 'elysia'

const state = t.Union([
  t.Literal('not-installed'),
  t.Literal('installing'),
  t.Literal('installed'),
  t.Literal('update-available'),
  t.Literal('error'),
  t.Literal('unavailable'),
])

const installationSource = t.Union([
  t.Literal('built-in'),
  t.Literal('managed'),
  t.Literal('external'),
  t.Null(),
])

const action = t.Object({
  available: t.Boolean(),
  reasonCode: t.Nullable(t.String()),
})

const key = t.Object({
  namespace: t.String({ minLength: 1 }),
  resourceType: t.String({ minLength: 1 }),
  resourceId: t.String({ minLength: 1 }),
})

const descriptor = t.Object({
  key,
  displayName: t.String({ minLength: 1 }),
  description: t.Nullable(t.String()),
  kind: t.String({ minLength: 1 }),
  required: t.Boolean(),
  state,
  installationSource,
  installedVersion: t.Nullable(t.String()),
  availableVersion: t.Nullable(t.String()),
  installedSizeBytes: t.Nullable(t.Number({ minimum: 0 })),
  downloadSizeBytes: t.Nullable(t.Number({ minimum: 0 })),
  actions: t.Object({
    install: action,
    update: action,
    uninstall: action,
  }),
})

export const ManagedResourceModel = {
  descriptor,
  keyParams: t.Object({
    namespace: t.String({ minLength: 1 }),
    resourceType: t.String({ minLength: 1 }),
    resourceId: t.String({ minLength: 1 }),
  }),
}
