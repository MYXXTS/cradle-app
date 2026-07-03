import { t } from 'elysia'

const worktreeStatusSchema = t.Union([
  t.Literal('active'),
  t.Literal('merged'),
  t.Literal('abandoned'),
])

const worktreeHealthSchema = t.Union([
  t.Literal('ok'),
  t.Literal('missing'),
  t.Literal('stale'),
])

export const WorktreeModel = {
  worktreeView: t.Object({
    id: t.String(),
    sourceWorkspaceId: t.String(),
    name: t.String(),
    path: t.String(),
    branch: t.String(),
    baseRef: t.String(),
    status: worktreeStatusSchema,
    createdBySessionId: t.Nullable(t.String()),
    createdAt: t.Number(),
    updatedAt: t.Number(),
  }),

  workspaceIdParams: t.Object({
    workspaceId: t.String({ minLength: 1 }),
  }),

  worktreeIdParams: t.Object({
    worktreeId: t.String({ minLength: 1 }),
  }),

  sessionIdParams: t.Object({
    sessionId: t.String({ minLength: 1 }),
  }),

  createBody: t.Object({
    sessionId: t.String({ minLength: 1 }),
    slug: t.Optional(t.String({ minLength: 1 })),
  }),

  cleanupBody: t.Object({
    mode: t.Union([t.Literal('merge-and-close'), t.Literal('abandon')]),
    targetBranch: t.Optional(t.String({ minLength: 1 })),
  }),

  isolationStartBody: t.Object({
    slug: t.Optional(t.String({ minLength: 1 })),
  }),

  isolationActivateBody: t.Object({
    mode: t.Union([
      t.Literal('migrate'),
      t.Literal('leave-main'),
      t.Literal('cancel'),
    ]),
  }),

  attachWorktreeBody: t.Object({
    worktreeId: t.String({ minLength: 1 }),
  }),

  issueIsolationContextGroup: t.Object({
    worktreeId: t.String(),
    name: t.String(),
    branch: t.String(),
    sessionIds: t.Array(t.String()),
    sessionTitles: t.Array(t.String()),
  }),

  worktreeHealth: worktreeHealthSchema,
}
