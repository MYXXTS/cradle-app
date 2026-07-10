# Plan 036: Introduce a user-controlled local Work container from isolated task to draft PR

> **Executor instructions**: Follow this plan milestone by milestone. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report instead of inventing a workaround.
> When complete, update Plan 036 in `plans/README.md` unless a reviewer told you
> they maintain the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat e26ad47..HEAD -- \
>   packages/db/src/schema packages/db/drizzle \
>   apps/server/src/modules/session apps/server/src/modules/session-group \
>   apps/server/src/modules/worktree apps/server/src/modules/pull-request \
>   apps/server/src/modules/chat-runtime/context apps/server/src/app.ts \
>   apps/web/src/features/new-chat apps/web/src/features/session \
>   apps/web/src/features/workspace apps/web/src/routes/chat \
>   apps/web/src/components/layout apps/web/src/store/layout.ts \
>   resources/system-workflow.md
> ```
>
> If the current code differs materially from the excerpts below, treat that as
> a STOP condition and refresh this plan before implementation.

## Status

- **Priority**: P1
- **Effort**: XL (six independently verifiable milestones)
- **Risk**: HIGH — introduces a new top-level product aggregate and changes the preferred local coding entry path
- **Depends on**: none; Plans 024, 033, and 034 are already complete and must not be reopened
- **Category**: direction / architecture
- **Planned at**: commit `e26ad47`, 2026-07-10

## Why this matters

Cradle already has all primitive capabilities needed for a useful local coding
loop: Chat Runtime, isolated worktrees, GitHub draft pull requests, session
awaits, and PR status controls. They are currently exposed as separate
session-scoped features. The user or agent must know that isolation exists,
create it through a second request, remember the Cradle-specific PR command,
write the PR body, and manually connect the result back to the conversation.

This plan adds a local-first `Work` aggregate representing one outcome the user
delegated to Cradle. A Work owns the objective and the relationships between its
primary chat thread and the existing local execution/PR capabilities. The first
product slice is intentionally narrow:

```text
Create Work -> create primary Session -> create ready managed Worktree
-> Agent edits/tests/commits -> Agent reports delivery readiness
-> user submits Work -> Cradle creates or updates Draft PR
-> user reviews and may Mark Ready -> user merges outside this plan
```

Cloud Agent, remote execution redesign, multi-repo scope, automatic merge, and
a general workflow engine are explicitly excluded. The design stores facts and
references only; it does **not** add a Work status machine.

## Product and domain decisions

These decisions are part of the plan. Do not replace them with a different
model during implementation.

1. **Work is distinct from Chat Session.** Quick chats and existing sessions may
   exist without a Work. A Work has one primary Session in v1 and may own more
   threads in later plans.
2. **Session Group remains an organizational folder.** Do not rename, migrate,
   or expand `session_groups`; it is not the Work aggregate.
3. **Local v1 always starts in a managed worktree.** Ordinary `POST /sessions`
   remains available for Chat. `POST /works` is the outcome-oriented coding
   entry path.
4. **Work references existing capabilities.** Worktree remains owned by the
   worktree module, chat transcript/runs remain owned by Chat Runtime, and live
   GitHub state remains owned by the pull-request module.
5. **No state machine.** Do not add `work_status`, transition tables, workflow
   nodes, or legal-transition code. Persist only `closedAt` and `archivedAt` if
   needed. Running/waiting/review labels are read projections from runs,
   awaits, isolation, and PR state.
6. **No platform auto-commit.** The Work service never invents or squashes
   commits. The Agent may create coherent commits inside the isolated Worktree
   as part of the coding task and includes the existing Cradle co-author
   trailer. Work submission validates that the checkout is clean and contains
   commits ahead of its base.
7. **External delivery requires explicit user intent.** Run completion,
   readiness detection, or a clean committed branch must never automatically
   push, create a PR, or update a PR. The Agent reports that the Work is ready;
   submission occurs only after the user clicks the Work delivery action, runs
   `cradle work submit`, or explicitly instructs the Agent to submit this Work.
8. **Delivery permission is one action, not a permanent mode.** A successful
   submit authorizes that push and PR create/update only. Follow-up changes
   require another explicit submit. Do not add an auto-submit toggle, background
   watcher, or remembered autonomy policy in v1.
9. **Human control remains explicit.** Work submission never marks ready and
   never merges. Existing Mark Ready UI remains user-driven and separately
   confirmed; merge stays outside Cradle automation.

### User control boundary

The local Worktree is the Agent's execution sandbox; GitHub is an external
delivery boundary. Preserve this distinction throughout server, prompt, and UX
implementation:

- The Agent may inspect, edit, run commands/tests, and create commits inside the
  managed Worktree while the user can stop or redirect the existing Chat Runtime
  run at any time.
- Clicking **Start Work** authorizes this local isolated execution only. It does
  not grant standing permission to push or interact with GitHub.
- A completed Agent run only refreshes readiness facts and handoff notes. It
  does not call the submit endpoint as a completion hook.
- Push and Draft PR create/update happen only through an explicit submit action.
- Failed GitHub actions retain all local commits and require an explicit retry;
  do not retry external side effects in the background.
- Before submit, the user can inspect Changes, continue the conversation, or
  archive/abandon the Work without publishing anything.
- Mark Ready and merge remain separate later decisions; submitting a Draft PR
  cannot imply either one.

## Target object model

Add Work-owned persistence under a new DB schema file rather than adding more
unstructured keys to `sessions.configJson`.

```ts
type Work = {
  id: string
  title: string
  objective: string
  linkedIssueId: string | null
  handoffTitle: string | null
  handoffSummary: string | null
  handoffTestPlan: string | null
  preparedAt: number | null
  lastSubmittedAt: number | null
  closedAt: number | null
  archivedAt: number | null
  createdAt: number
  updatedAt: number
}

type WorkThread = {
  workId: string
  sessionId: string
  role: 'primary' | 'supporting'
  createdAt: number
}
```

Required invariants:

- A Session belongs to at most one Work.
- A Work has exactly one primary thread after successful creation.
- `work_threads` owns the relationship. Do not add `workId` to the Session row;
  this keeps Work namespace writes inside the Work module.
- Enforce one primary thread per Work with a partial unique index when SQLite /
  Drizzle supports the repository's existing index style. If generation cannot
  express it cleanly, enforce it in Work service transaction tests and add a
  normal index; do not hand-write a trigger.
- Existing sessions and Session Groups are not backfilled. They remain Chat
  sessions, not Work, unless a later explicit migration promotes them.
- `handoffTitle`, `handoffSummary`, `handoffTestPlan`, `preparedAt`, and
  `lastSubmittedAt` are delivery evidence, not lifecycle state. The Agent may
  replace the prepared handoff without publishing it. `lastSubmittedAt` changes
  only after an explicit successful user-controlled submit.

The Work detail API is an aggregate read model, not another source of truth:

```ts
type WorkDetail = {
  work: Work
  primaryThread: SessionView
  execution: SessionIsolationView
  readiness: PullRequestReadiness
  pullRequest: SessionPullRequestView | null
  activity: 'idle' | 'running' | 'waiting' | 'blocked'
}
```

`activity` is computed on read. It must not be stored.

## UX specification

The implementation must make Work understandable without requiring the user to
discover isolation, Worktree, PR, or CLI features separately. Work is a visible
product object, not a hidden mode on a Chat submit button.

### Information architecture

Add two explicit creation surfaces to the top navigation:

```text
New Work
New Chat
Search
Diffs
Automation
...
```

- **New Work** creates an outcome-oriented local coding task. It requires a
  local Git workspace and always starts in a managed Worktree.
- **New Chat** keeps the current flexible conversation behavior, including
  no-project chats, remote sessions, issue flows, and Session Groups.
- Do not replace New Chat or turn every Session into Work.

Within each expanded Workspace sidebar section, show two semantic lists:

```text
Work
  Fix checkout retry edge case       Draft PR #42
  Add keyboard navigation            Running

Chats
  Investigate auth architecture
  Explain the payment service
```

- Work rows come from `GET /works?workspaceId=...`.
- Primary Work Sessions must not appear a second time under Chats.
- Session Groups continue to organize ordinary Chats only in this plan.
- Empty Work or Chat sections are omitted; do not add persistent empty-state
  boxes to every Workspace.

### Routes and surfaces

Add dedicated TanStack routes and app surfaces:

```text
/work/new
/work/$workId
```

Add `new-work` and `work` surface kinds, stable surface ids, navigation helpers,
route-to-surface restoration, layout contract coverage, and close/archive
behavior. Do not route a Work primary thread through `/chat/$sessionId`; the
same Chat Runtime UI is embedded inside the Work surface, but the product URL
and surface identity remain Work-owned.

Direct navigation to `/chat/$sessionId` must resolve whether the Session is a
primary Work thread before mounting the Chat surface. If it is, replace the URL
with `/work/$workId`; ordinary Sessions continue to render as Chat. This avoids
two URLs, two surface identities, and duplicate passive-stream ownership for
the same conversation.

The Work surface should reuse the primary Session conversation rather than
forking a second renderer implementation. Extract a shared session conversation
surface from `ChatSessionRouteContent` if necessary, and use it from both Chat
and Work routes.

### New Work creation experience

`/work/new` may reuse the current composer, workspace picker, Agent/model
selection, attachments, and first-response boundary, but it must present a
different promise:

- Page title: **New Work**
- Supporting copy: the Agent can work and commit inside an isolated Worktree,
  but nothing is pushed to GitHub until the user chooses Create Draft PR
- Workspace is required and only local Git-backed workspaces are selectable
- One primary button: **Start Work**
- No split-button or hidden “in worktree” menu on this surface
- The objective composer remains the primary visual element; do not turn the
  page into a setup form

The existing New Chat isolated shortcut may remain temporarily for legacy issue
flows, but the normal user-facing navigation should direct new outcome-oriented
work to New Work.

When the source checkout is dirty, keep the user on `/work/new` and render an
inline blocking card near the submit action:

```text
Your source checkout has uncommitted changes.
New Work starts from a clean commit so it cannot accidentally omit or mix them.

[Open Changes] [Try Again]
```

- Do not auto-stash, auto-commit, or discard source changes.
- Do not rely on a toast as the only error explanation.
- `Open Changes` uses the existing Changes panel/surface for that Workspace.

### Work surface

The main Work surface contains three layers:

1. **Header** — Work title, one concise activity label, branch, and PR affordance.
2. **Conversation** — the existing primary Session chat and composer, occupying
   the main content area.
3. **Work tab in the existing Right Aside** — objective, execution facts,
   changes/readiness, latest handoff notes, and delivery actions.

Do not introduce another permanently visible custom rail beside the existing
Right Aside. Extend `RightAside` with a conditional Work tab when the active
Session belongs to a Work. On first opening a Work surface, select the Work tab;
after the user selects Files/Changes/Git/Runtime, preserve their explicit
selection normally. Initialize the tab once when the Work surface becomes
active; do not drive `asideActiveTab` from Work query refreshes or render-time
effects that can repeatedly force the user back to Work.

The Work tab sections are:

```text
Objective
  Full Work objective, readable but visually quiet.

Execution
  Managed Worktree · cradle/wt/...
  Clean / N changed files · N commits ahead

Handoff
  Latest summary
  Latest test plan

Delivery
  Not prepared
  — or —
  Ready to submit · Changes are still local
  — or —
  Draft PR #42 · Open PR · Mark Ready
```

Use existing `Card`, `Badge`, `Button`, `Separator`, `Tooltip`, and Right Aside
patterns. Do not create a second design language. Tailwind classes must remain
static and composed with `cn()`.

### Prepared handoff and review

When the Agent finishes an implementation pass, it prepares delivery metadata
without pushing or calling GitHub. Show a high-signal, non-modal card at the top
of the Work tab:

```text
Ready to submit
The committed changes are still local. Review them before publishing.
[Review Changes] [Create Draft PR]
```

- `Review Changes` opens the existing Changes/Diff experience scoped to Work.
- `Create Draft PR` is the explicit user-controlled submit action.
- The user may ignore the card, continue chatting, or archive the Work; nothing
  is pushed in the background.
- If a Draft PR already exists and follow-up changes are prepared, label the
  action **Update Draft PR** and require another click.

When Work submission creates or updates a Draft PR:

- Keep the user in the same Work surface.
- Show a high-signal, non-modal handoff card at the top of the Work tab:

  ```text
  Ready for your review
  Draft PR #42 has the latest committed changes.
  [Review Changes] [Open PR] [Mark Ready]
  ```

- `Review Changes` opens the existing workspace Changes/Diff experience scoped
  to the Work primary Session.
- `Open PR` opens GitHub externally.
- `Mark Ready` reuses the existing user-driven mutation and confirmation/error
  treatment.
- Do not show celebration animation, confetti, or an automatic modal. This is a
  frequent professional handoff, not a rare onboarding event.

### Follow-up changes

The Work remains open after Draft PR creation. The user can ask for changes in
the same conversation. The Agent edits and commits in the same Worktree, then
updates the prepared handoff. The user explicitly chooses **Update Draft PR**.

Repeated submit must:

- push the latest committed branch
- update the existing open Draft PR title/body rather than create a second PR
- replace the Work's latest handoff summary/test plan
- refresh the Work tab without navigating away

No run-completion callback, readiness poll, or Work-detail refresh may invoke
submit. A clean branch and `commitsAhead > 0` only enable the user action.

If the bound PR is merged or closed, reject submit with a clear Work-tab error
and require a new Work for a new delivery. Do not reopen or silently replace it.

### Sidebar row presentation

Work rows should remain compact and comparable to existing Session rows:

- title is the primary text
- one static derived activity indicator; no continuously animated spinner
- optional trailing Draft/Ready/Merged PR label
- running/error/PR information must have accessible text, not color alone
- context menu: Open, Rename, Mark read/unread if still meaningful, Archive,
  Open Worktree in Finder/IDE when available

Do not display branch, Agent, model, changed-file count, and PR number all at
once in the sidebar. Those details belong in the Work surface.

### Empty, loading, and failure states

- New Work loading: keep composer layout stable; disable Start Work and show the
  existing small Spinner in the button.
- Work route loading: use the existing route/surface loading conventions; avoid
  a full-page branded skeleton.
- Work not found: use `RouteErrorFallback` with return-home behavior.
- Worktree missing/stale: conversation input is disabled, Work tab shows Repair
  / Return to source / Abandon actions by composing existing isolation recovery.
- GitHub auth missing at submit: keep commits intact, show authentication action
  and retry; do not mark Work failed.
- PR update failure: show the last known PR and a retry action; do not hide it.
- First Agent response failure: retain the Work and primary Session so the user
  can retry from the Work surface.

### Interaction and motion rules

- Navigation, sidebar selection, composer submission, and Right Aside tab
  switching are frequent actions; do not add new entrance animations.
- Reuse existing button active feedback and existing Right Aside transitions.
- New handoff/error cards may fade in with opacity only, at most 160ms ease-out;
  no height animation and no `transition-all`.
- Keep focus visible, label all icon-only actions, and preserve keyboard access
  for New Work, sidebar Work rows, Right Aside tabs, and delivery actions.
- Respect reduced motion through existing primitives; do not add custom motion
  that bypasses it.

## Current state

### Existing Session is overloaded but remains the chat owner

`packages/db/src/schema/chat.ts:30-58` stores conversation identity alongside
workspace, provider, issue, Session Group, worktree bindings, and archive/read
metadata:

```ts
export const sessions = sqliteTable('sessions', {
  id: textPk(),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  origin: text('origin').notNull().default('manual'),
  providerTargetId: text('provider_target_id'),
  runtimeKind: text('runtime_kind').notNull().default('standard'),
  agentId: text('agent_id'),
  configJson: text('config_json').notNull().default('{}'),
  linkedIssueId: text('linked_issue_id'),
  sessionGroupId: text('session_group_id'),
  worktreeId: text('worktree_id'),
  pendingWorktreeId: text('pending_worktree_id'),
  // ...
})
```

Do not move transcript, provider selection, runtime bindings, or queue ownership
out of Session/Chat Runtime in this plan.

### Session Group is explicitly lightweight

`apps/server/src/modules/session-group/README.md:3-9` says Session Group is a
workspace-scoped lightweight metadata container and that chat execution remains
session-owned. Keep that contract unchanged.

### New isolated chat creation is a browser-owned multi-request sequence

`apps/web/src/features/new-chat/new-chat-page.tsx:285-308` creates a Session,
optionally starts isolation in a second request, then starts the first response:

```ts
const { data: sessionData } = await postSessions({ body })
// ...
if (isolation?.choice === 'new-isolated') {
  await postSessionsByIdIsolationStart({
    path: { id: session.id },
    body: { slug: sessionTitle },
  })
}
startOptimisticChatResponse({ sessionId: session.id, ... })
```

This can leave an empty Session when isolation fails. More importantly,
`startSessionIsolation()` may leave isolation pending when the source checkout
is dirty, so the first response can start before the dedicated worktree becomes
the active execution root.

### Isolation creation already has the right low-level capability

`apps/server/src/modules/worktree/service.ts:541-600` creates a managed checkout
and binds it to a Session. It also handles streaming/dirty-main pending behavior.
The Work entry path must reuse `createWorktree`/binding primitives but must not
allow a pending first execution: Work creation requires a clean source checkout
in v1 and returns a clear conflict before creating the Work when it is dirty.

### Draft PR lifecycle already exists

`apps/server/src/modules/pull-request/service.ts:278-369` validates GitHub auth,
requires an isolated Session, rejects a dirty checkout, pushes the branch,
creates a draft PR, and persists the binding. `service.ts:372-415` marks a bound
PR ready. Reuse these functions; do not call `gh pr create` or duplicate the
GitHub API implementation.

The current create function does not prove that the branch contains commits
ahead of the base. Add a reusable pull-request-owned readiness inspection so
Work submission can reject an empty branch before pushing. Readiness inspection
must remain read-only; it cannot trigger delivery.

### PR workflow instructions are globally injected

`apps/server/src/modules/chat-runtime/context/turn-context.ts:67-86` prepends the
entire `resources/system-workflow.md` to every Session system prompt.
`resources/system-workflow.md:25-60` contains detailed isolated PR instructions
for all sessions. Replace automatic-submit guidance with Work-specific dynamic
context that prepares a handoff but requires explicit user intent before
delivery; keep the global workflow short and generic.

### Existing review controls are already sufficient for v1

`apps/web/src/features/session/session-pull-request-chrome.tsx:20-93` shows the
bound PR and exposes Mark Ready only while the PR is an open draft. Preserve
this behavior. The Work UI may compose or wrap it, but must not add merge.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate DB migration | `pnpm --filter @cradle/db generate` | exit 0; one append-only migration and matching meta snapshot are added |
| Generate web API | `pnpm generate:web` | exit 0; generated client includes Work routes |
| Generate CLI | `pnpm gen:cli` | exit 0; generated CLI includes `work` commands |
| Server typecheck | `pnpm --filter @cradle/server typecheck` | exit 0, no TypeScript errors |
| Server focused tests | `pnpm --filter @cradle/server exec vitest run src/modules/work tests/work.test.ts src/modules/pull-request src/modules/chat-runtime/context --maxWorkers=1 --reporter=dot` | all selected tests pass |
| Web typecheck | `pnpm --filter @cradle/web typecheck` | exit 0, no TypeScript errors |
| Web focused tests | `pnpm --filter @cradle/web exec vitest run --config vite.config.ts --environment jsdom src/features/work src/features/new-chat --reporter=dot` | all selected tests pass |
| CLI typecheck | `pnpm --filter @cradle/cli typecheck` | exit 0 |
| Full verification | `pnpm test` | all repository Vitest projects pass |
| Diff hygiene | `git diff --check` | no output |

Do not rewrite or squash existing files under `packages/db/drizzle`. Migration
history is append-only; see `packages/db/drizzle/README.md`.

## Suggested executor toolkit

- Use the `server-app-development` skill for Elysia/TypeBox/OpenAPI ownership.
- Use the `cli-app-development` skill after route metadata changes; generated
  commands must come from OpenAPI metadata, not hand-written protocol copies.
- Use `vercel-react-best-practices` while changing React query/composer paths.
- Run `react-doctor --diff` if available after the web milestone; report
  pre-existing findings instead of fixing unrelated files.

## Scope

**In scope**:

- `packages/db/src/schema/work.ts` (new)
- `packages/db/src/schema/index.ts`
- append-only generated files in `packages/db/drizzle/`
- `apps/server/src/modules/work/` (new module: routes, models, service, tests, README)
- `apps/server/src/app.ts` (module registration only)
- `apps/server/src/modules/worktree/service.ts` and focused tests (clean-source preflight and failure compensation primitives)
- `apps/server/src/modules/pull-request/service.ts`, model/helper/tests (readiness inspection and Work submission reuse)
- `apps/server/src/lib/github-api.ts` and focused tests only if updating an existing PR title/body requires a missing GitHub primitive
- `apps/server/src/modules/chat-runtime/context/turn-context.ts`, adjacent Work context helper/tests
- `resources/system-workflow.md` (remove automatic delivery procedure from the global prompt)
- `apps/web/src/features/work/` (new hooks/chrome)
- `apps/web/src/features/new-work/` (new creation surface)
- `apps/web/src/features/new-chat/new-chat-page.tsx` only for removing/de-emphasizing the generic isolated shortcut without breaking issue flows
- `apps/web/src/routes/work/new.tsx` and `apps/web/src/routes/work/$workId.tsx` (new)
- `apps/web/src/routes/chat/$sessionId.tsx` and focused route tests for redirecting primary Work threads
- `apps/web/src/navigation/navigation-commands.ts`
- `apps/web/src/navigation/surface-identity.ts` and focused tests
- `apps/web/src/components/layout/layout-contract.ts` and focused tests
- `apps/web/src/components/layout/right-aside.tsx` and focused tests
- `apps/web/src/store/layout.ts` and `apps/web/src/store/layout.test.ts`
- `apps/web/src/components/layout/app-header.tsx`
- `apps/web/src/features/workspace/workspace-sidebar.tsx`, Work/session list hooks, and focused tests
- Work-related locale resources under `apps/web/src/locales/`
- generated web API files under `apps/web/src/api-gen/`
- generated CLI commands under `packages/cli/src/commands/generated/work/`
- affected module READMEs

**Out of scope — do not touch**:

- `apps/server/src/modules/session/remote-projection.ts`
- `apps/server/src/modules/remote-hosts/**`
- remote Session source-of-truth semantics from Plans 033/034
- Cloud Agent, hosted execution, or generic Execution provider interfaces
- Session Group server schema, routes, services, migration, and ownership semantics
- standalone Session Group UI redesign; only narrow Workspace-sidebar filtering
  needed to prevent a primary Work thread appearing twice is allowed
- Issue Agent delegation, Automation, Diff Review, or Session Await behavior
- multi-repo Work scope
- automatic commit generation, automatic Mark Ready, automatic merge, or deployment
- automatic push or Draft PR create/update triggered by run completion,
  readiness detection, polling, or background retry
- persistent per-Work autonomy modes or an auto-submit toggle
- moving existing PR persistence out of `sessions.configJson`
- a Work event log, workflow engine, transition table, or status machine
- retroactively converting existing Sessions into Work
- a global Work dashboard, kanban board, timeline, or analytics page

If implementation appears to require any out-of-scope item, STOP and split a
follow-up plan instead of widening this one.

## Git workflow

- Suggested branch: `feat/local-work-container`
- Match the repository's conventional commit style, for example
  `feat(work): add local work creation`.
- Keep schema/module, submit flow, and web adoption as separate logical commits.
- Do not push or open a PR unless the operator explicitly requests it.
- When commits are created by a Cradle-managed Agent session, include the
  repository-required `Co-authored-by: Cradle Agent <cradleagent@wibus.ren>`
  trailer.

## Milestone 0: Lock the contracts with characterization tests

Before adding Work, add or extend focused tests proving the existing behaviors
the new orchestration relies on:

1. `PullRequest.createDraftPullRequest()` rejects a dirty isolated checkout and
   always creates a draft.
2. `Worktree.startSessionIsolation()` binds a clean idle Session immediately.
3. A dirty source checkout produces a pending isolation in the legacy Session
   route; this behavior stays for ordinary Sessions.
4. Work-specific context is absent from an ordinary Session prompt.

Use existing patterns from:

- `apps/server/src/modules/pull-request/service.test.ts`
- `apps/server/src/modules/worktree/worktree-setup.test.ts`
- `apps/server/src/modules/session-group/service.test.ts`
- `apps/server/src/modules/chat-runtime/context/turn-context.test.ts`

Do not change production behavior in this milestone.

**Verify**:

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/pull-request src/modules/worktree \
  src/modules/chat-runtime/context --maxWorkers=1 --reporter=dot
```

Expected: all selected tests pass.

## Milestone 1: Add Work persistence and read APIs

### 1.1 Add Work-owned schema

Create `packages/db/src/schema/work.ts` with `works` and `workThreads`.

Required columns and constraints:

- `works.id`: text primary key
- `works.title`: non-empty text at service boundary
- `works.objective`: non-empty text at service boundary
- `works.linkedIssueId`: nullable FK to `issues`, `onDelete: set null`
- `works.handoffTitle`, `works.handoffSummary`, `works.handoffTestPlan`: nullable text
- `works.preparedAt`, `works.lastSubmittedAt`: nullable integer timestamps
- `works.closedAt`, `works.archivedAt`: nullable integer timestamps
- standard `createdAt` / `updatedAt`
- `workThreads.workId`: FK to Work, cascade on delete
- `workThreads.sessionId`: FK to Session, cascade on delete, unique so a
  Session belongs to at most one Work
- `workThreads.role`: `primary | supporting`
- `workThreads.createdAt`
- indexes by Work and Session

Do not add `status`, `configJson`, `executionKind`, `pullRequestJson`, or provider
fields to Work.

Generate an append-only migration with `pnpm --filter @cradle/db generate`.
Inspect the generated SQL and confirm it only creates the new Work tables and
indexes. Do not edit old migrations.

### 1.2 Add the Work module

Create `apps/server/src/modules/work/` following the Elysia module convention:

```text
work/
  index.ts
  model.ts
  service.ts
  service.test.ts
  README.md
```

Expose these initial routes:

| Method | Path | CLI | Purpose |
|---|---|---|---|
| `GET` | `/works` | `work list` | list non-archived Works, optional workspace/issue filter derived through primary Session |
| `GET` | `/works/:id` | `work get` | aggregate Work detail |
| `GET` | `/sessions/:sessionId/work` | none | resolve the Work containing a Session for web chrome/context |
| `POST` | `/works/:id/archive` | `work archive` | set/clear `archivedAt`; archive/restore the primary Session through Session service |

The Work aggregate reader composes:

- Work row and primary WorkThread
- `Session.get(primarySessionId)`
- `Worktree.readSessionIsolationAsync(primarySession)`
- `PullRequest.getPullRequest(primarySessionId)`
- Chat Runtime read projections and Session Await summary for derived activity

Activity precedence, implemented as a pure read helper and covered by tests:

1. `blocked` when isolation health is missing/stale or the latest relevant run failed
2. `waiting` when the primary Session has a pending await or pending user/tool input
3. `running` when Session status is streaming
4. `idle` otherwise

This precedence is a view rule, not a transition system.

Register the module in `apps/server/src/app.ts` and document ownership in the
new README. Work service may import Session, Worktree, Pull Request, and Await
service APIs. Those modules must not import Work to perform their own writes.

**Verify**:

```bash
pnpm --filter @cradle/server exec vitest run src/modules/work --maxWorkers=1 --reporter=dot
pnpm --filter @cradle/server typecheck
```

Expected: Work CRUD/membership/activity tests pass; typecheck exits 0.

## Milestone 2: Add atomic local Work creation

Add `POST /works` with `x-cradle-cli.command = ['work', 'create']`.

The request contains:

- `workspaceId`
- `title`
- `objective`
- the same local Agent/provider/model/thinking/runtime-settings selection needed
  to create the primary Session
- optional `linkedIssueId`

It does not accept `sessionGroupId`, remote workspace locators, an existing
worktree id, or a non-worktree execution mode.

### 2.1 Add deterministic preflight

Before writing Work or Session rows:

1. Require a local workspace backed by a Git repository.
2. Require the source checkout to be clean. Return `409 work_source_dirty`
   with changed-file count when dirty.
3. Validate Agent/provider launchability through existing Session creation
   helpers; do not duplicate provider logic in Work.

Do not silently omit dirty local changes and do not reuse the legacy pending
isolation boundary for new Work.

### 2.2 Orchestrate creation with compensation

The service flow is:

1. Insert Work.
2. Create the primary Session through `Session.create()` with origin `work` (add
   this broad origin if the current schema/API validation requires it).
3. Insert the primary WorkThread relationship.
4. Start Session isolation.
5. Assert the result is immediately active, not pending, and health is `ok`.
6. Return Work detail plus the primary Session id.

If steps 2-5 fail, compensate in reverse order:

- remove any checkout/worktree record created by this request using a
  worktree-owned cleanup helper
- delete the newly created primary Session
- delete the Work

Do not leave an empty Work, empty Session, or orphan managed checkout.
Strengthen `startSessionIsolation()` so a failure after `createWorktree()` also
cleans its own newly created checkout before rethrowing.

Add service tests using a temporary real Git repository for:

- successful creation: one Work, one primary thread, one healthy worktree
- dirty source rejection: no Work/Session/worktree rows created
- worktree creation failure: no Work/Session rows remain
- Session creation/relationship failure compensation
- non-local workspace rejection without calling the remote projection path

**Verify**:

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/work src/modules/worktree --maxWorkers=1 --reporter=dot
```

Expected: all creation and compensation tests pass; no temp checkout survives
failed cases.

## Milestone 3: Add Work-specific handoff preparation and user-controlled submit

### 3.1 Move delivery instructions out of the global prompt

Refactor `resolveSessionSystemPrompt()` so ordinary Sessions keep only generic
Cradle operating guidance. Remove the detailed automatic isolated-PR procedure
from `resources/system-workflow.md`.

When a Session is the primary thread of a Work, append a short dynamic Work
context block containing:

- Work id, title, and objective
- current managed worktree path and branch
- instruction to implement, verify, create coherent commits, and keep the
  checkout clean
- required commit trailer
- exact requirement to inspect `cradle man work prepare` and call
  `cradle work prepare <workId> ...` when the result is ready for user review
- explicit prohibition on calling `work submit`, pushing, creating/updating a
  PR, Mark Ready, or merge unless the user explicitly requests that action

Do not inject raw PR JSON, full tool logs, or repeated transcript summaries.
Add tests proving:

- ordinary Session prompts do not contain Work submission instructions
- primary Work thread prompts contain the correct Work id/objective/branch
- primary Work instructions distinguish local handoff preparation from external
  submission
- supporting threads, when added in future, do not prepare or submit unless Work
  service marks them primary

### 3.2 Add pull-request readiness inspection

In the pull-request module, add a reusable read helper that checks the primary
Session execution root and returns structured facts:

```ts
type PullRequestReadiness = {
  isolated: boolean
  clean: boolean
  branch: string | null
  baseRef: string | null
  commitsAhead: number
  changedFiles: number
}
```

The helper owns Git comparison semantics. Work must not run its own raw Git
commands to duplicate this logic.

### 3.3 Add side-effect-free Work prepare route

Add `POST /works/:id/prepare` with CLI command `work prepare`.

Request body:

```ts
{
  title: string
  summary: string
  testPlan: string
}
```

Preparation behavior:

1. Resolve the primary Session and inspect readiness.
2. Require a healthy isolated execution root, clean checkout, and
   `commitsAhead > 0` so the handoff corresponds to reviewable committed work.
3. Persist `handoffTitle`, `handoffSummary`, `handoffTestPlan`, and `preparedAt`.
4. Return refreshed Work detail without pushing, authenticating with GitHub,
   creating/updating a PR, starting CI awaits, or mutating `lastSubmittedAt`.

Repeated prepare replaces the prior proposed handoff. It is safe for the Agent
to call after each implementation pass because it has no external delivery side
effect. Add tests proving prepare never invokes pull-request or GitHub helpers.

### 3.4 Add explicit Work submit route

Add `POST /works/:id/submit` with CLI command `work submit`.

Request body:

```ts
{
  title?: string
  summary?: string
  testPlan?: string
  base?: string
}
```

The generated UI/CLI action is an explicit user operation. Omitted handoff
fields use the latest prepared values; optional fields allow the user to edit
the proposed title, summary, or test plan before delivery. Reject submit when no
complete prepared or overridden handoff exists.

Submission behavior:

1. Resolve the primary Session.
2. Inspect readiness and reject unless isolation is healthy, checkout is clean,
   and `commitsAhead > 0`.
3. Render a deterministic PR body:

   ```md
   ## Summary
   <summary>

   ## Test plan
   <testPlan>
   ```

4. Resolve the prepared/overridden title, summary, and test plan.
5. If no PR exists, call `PullRequest.createDraftPullRequest()` with the primary
   Session id.
6. If an open PR exists, push the latest branch and update the existing PR
   title/body through pull-request-owned service/API helpers. Do not create a
   second PR.
7. If the bound PR is closed or merged, reject with a stable error.
8. Only after the GitHub operation succeeds, persist the delivered handoff and
   `lastSubmittedAt`, then return refreshed Work detail.

Do not call this route from a run completion hook, readiness effect, or
background task. Do not start a GitHub CI await automatically. Do not mark
ready. Failed submission keeps the prepared handoff and local commits so the
user can explicitly retry.

Add tests for preparation without GitHub calls, missing preparation, dirty
checkout, no commits, missing GitHub auth, successful user-triggered draft
creation, repeated explicit submit updating the same PR, closed/merged PR
rejection, retained preparation after failure, and deterministic body rendering.

**Verify**:

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/work src/modules/pull-request \
  src/modules/chat-runtime/context --maxWorkers=1 --reporter=dot
pnpm --filter @cradle/server typecheck
```

Expected: all Work prompt/readiness/prepare/submit tests pass; typecheck exits 0.

## Milestone 4: Implement the complete local Work UX

### 4.1 Add Work surface identity and navigation

Add `new-work` and `work` to `SurfaceKind` and `SurfaceRoute`. Add stable helpers
such as `newWorkSurfaceId()` / `workSurfaceId(workId)`, route restoration, and:

```ts
openNewWork({ workspaceId?, issueId? })
openWork(workId)
```

Add routes `/work/new` and `/work/$workId`, route error boundaries, surface
store tests, and layout-contract tests proving a Work surface exposes the
primary Session/workspace to the existing Right Aside, Browser Panel, and
bottom terminal.

### 4.2 Build New Work by reusing composer capabilities

Create `apps/web/src/features/new-work/`. Extract shared composer/runtime
selection logic from New Chat only when needed to avoid copy/paste; do not move
unrelated recent-chat, issue, or Session Group behavior into a generic god hook.

New Work must:

- require a local workspace
- call `POST /works` once
- use the objective text as the first prompt without truncating it
- start the optimistic first Agent response only after Work creation succeeds
- navigate to `/work/$workId`
- keep source-dirty and creation errors inline as defined in the UX spec

Normal New Chat continues to call `POST /sessions`. Issue-specific continue /
new isolation behavior stays on New Chat until a later Work/Issue plan.

### 4.3 Add the Work route around the primary Session conversation

Create Work route content that fetches Work detail, resolves the primary Session,
and renders the existing Chat Runtime conversation/composer. Extract a shared
session-conversation component from `ChatSessionRouteContent` if required so
Chat and Work have identical streaming, queue, approval, terminal, Browser
Panel, and bottom-panel behavior.

Do not duplicate `useChatSession`, message rendering, composer, runtime settings,
or passive stream ownership in the Work feature.

Update `/chat/$sessionId` to resolve the optional primary Work relationship
before mounting `ChatSplitWorkspace`. Replace-navigate primary Work threads to
`/work/$workId`; render ordinary Sessions exactly as today. Cover direct URLs,
history replacement, loading, not-found behavior, and the absence of a second
Chat Runtime mount.

### 4.4 Add Work-aware header and Right Aside tab

Create under `apps/web/src/features/work/`:

- Work query key/hooks, including list and session-to-Work resolution
- `work-chrome.tsx`
- `work-aside-panel.tsx`
- pure formatting/projection helpers and tests

Extend `RightAside` with a conditional Work tab and render the sections from the
UX spec. Make it the initial tab for a Work surface without continually
overriding the user's later tab choice. Use the existing layout store API or a
narrow extension in `apps/web/src/store/layout.ts`; initialize on Work-surface
activation rather than on every Work-detail update. Add store/interaction tests
proving the initial Work selection occurs once and subsequent explicit tab
selection is preserved.

In `app-header.tsx`, show Work title/activity/branch/PR as one composed Work
chrome. Do not render three adjacent Session Execution, Isolation, and PR
controls for Work surfaces. Preserve those existing controls for ordinary Chat.

### 4.5 Add Work and Chat sections to Workspace sidebar

Add a `New Work` top navigation item before New Chat. Under each Workspace:

- list non-archived Work rows first
- list ordinary Chat Sessions below
- exclude primary Work Session ids from Chat and Session Group rendering
- open Work rows through `/work/$workId`
- retain current Chat context menus and interactions for ordinary Sessions

Add focused tests for partitioning, empty section omission, Work row labels,
archive removal, and no duplicate primary Session.

### 4.6 Add review handoff and failure states

Implement both delivery cards:

- **Ready to submit** with Review Changes and explicit Create/Update Draft PR
- **Ready for your review** with Review Changes, Open PR, and Mark Ready

The Create/Update Draft PR button calls submit only from the user event handler;
query refreshes, Agent completion, and readiness changes only update its enabled
state. Also implement repeated-submit refresh, source-dirty inline block,
missing-worktree recovery, explicit GitHub auth retry, and first-response retry
behavior specified above.

Add localized strings for all visible Work UX. Use no hard-coded English in
feature components.

**Verify**:

```bash
pnpm generate:web
pnpm --filter @cradle/web exec vitest run --config vite.config.ts \
  --environment jsdom src/features/work src/features/new-work \
  src/features/new-chat src/features/workspace \
  src/navigation src/components/layout --reporter=dot
pnpm --filter @cradle/web typecheck
```

Expected: generated client includes Work routes; focused tests and typecheck
pass.

## Milestone 5: Generate CLI, update docs, and run full verification

Run `pnpm gen:cli` and confirm generated commands include at least:

```text
cradle work list
cradle work get <id>
cradle work create ...
cradle work prepare <id> ...
cradle work submit <id> ...
cradle work archive <id> ...
```

Do not hand-edit generated command files except through the generator's normal
output. Confirm `cradle man work` exposes required arguments and descriptions.

Update documentation:

- Work module README: ownership, no-status-machine rule, aggregate read model,
  local-only v1, and excluded Remote/Cloud behavior
- Session README: Session is a conversation thread and may be a Work primary
  thread; Session Group remains separate
- Worktree README: Work creation is the preferred clean-source isolated entry,
  while legacy Session isolation remains available
- Pull Request README: Work prepare is local metadata only; explicit Work submit
  composes the existing session-bound PR lifecycle; Mark Ready remains user-driven
- Chat Runtime README: Work context is selectively appended for primary Work
  threads; the global prompt no longer carries the full PR workflow
- New Work README: composer reuse boundary, inline preflight errors, Work route,
  Work sidebar, and review handoff
- New Chat README: Chat remains conversational and distinct from Work
- Workspace README: Work/Chat sidebar partition and no duplicate primary thread
- Layout README: Work surface and conditional Right Aside Work tab

Then run:

```bash
pnpm --filter @cradle/server typecheck
pnpm --filter @cradle/web typecheck
pnpm --filter @cradle/cli typecheck
pnpm test
git diff --check
```

Expected: all commands exit 0 and `git diff --check` prints nothing.

## Test plan

### Server

- `apps/server/src/modules/work/service.test.ts`:
  - Work CRUD and primary-thread uniqueness
  - aggregate detail composition
  - derived activity precedence
  - successful clean local creation
  - dirty source rejection with no partial rows
  - worktree/session failure compensation
  - archive propagation to primary Session
  - prepare stores handoff without GitHub calls
  - submit readiness errors and explicit successful Draft PR
- `apps/server/src/modules/pull-request/service.test.ts`:
  - commits-ahead readiness
  - empty branch rejection facts
  - existing dirty/draft/ready behavior remains intact
- `apps/server/src/modules/chat-runtime/context/turn-context.test.ts`:
  - Work prompt selection and ordinary Session exclusion
- extend existing worktree focused tests for cleanup after failed binding

### Web

- Add pure/interaction tests under `apps/web/src/features/work/` for Work chrome
  / Work panel projections and query normalization.
- Add New Work tests proving Start Work calls `POST /works` once, then starts the
  first response and navigates to `/work/$workId`.
- Prove dirty-source and failed Work creation do not start an optimistic response.
- Prove ordinary New Chat creation remains unchanged.
- Add route/surface/navigation/layout tests for `new-work` and `work`.
- Add a Chat-route guard test proving a direct primary Work Session URL replaces
  to `/work/$workId`, while an ordinary Session stays on `/chat/$sessionId`.
- Add Workspace sidebar partition tests proving Work primary Sessions are not
  duplicated under Chats or Session Groups.
- Add Right Aside tests for conditional Work tab, initial selection, preserved
  user selection across Work-detail refreshes, review handoff actions, and
  accessible labels.
- Prove Agent completion/readiness refresh enables the delivery action but never
  invokes submit; only Create/Update Draft PR user interaction invokes it once.

### CLI and generated contracts

- Confirm generated command snapshots/help include Work commands.
- Add a CLI generator regression test only if the existing generator test
  pattern requires one for `default`/positional behavior; do not create a
  hand-written Work client.

## Done criteria

All criteria must hold:

- [ ] `works` and `work_threads` exist through one append-only Drizzle migration
- [ ] No `work_status` column, transition service, workflow graph, or state-machine package exists
- [ ] Ordinary Sessions can still be created without a Work
- [ ] `POST /works` creates exactly one Work, one primary Session relationship, and one immediately active healthy managed worktree
- [ ] Dirty source checkout rejects Work creation before any Work/Session/worktree is persisted
- [ ] Failed Work creation leaves no orphan Session or managed checkout
- [ ] Primary Work thread receives concise prepare-without-publish instructions; ordinary Sessions do not
- [ ] `cradle work prepare` stores a review handoff without push, GitHub auth, or PR mutation
- [ ] Run completion and readiness refresh never call Work submit automatically
- [ ] `cradle work submit` rejects missing preparation and dirty/empty branches, then creates a Draft PR only after explicit user invocation
- [ ] Work submit does not wait for CI, Mark Ready, or merge
- [ ] Existing user-driven Mark Ready behavior still works
- [ ] New Work uses `POST /works`; New Chat and issue-specific isolation flows remain unchanged
- [ ] Top navigation exposes distinct New Work and New Chat entries
- [ ] New Work has a dedicated route and one primary Start Work action
- [ ] Start Work authorizes local isolated execution only and does not grant automatic GitHub delivery
- [ ] Each Workspace sidebar separates Work from Chats without duplicating the primary Session
- [ ] `/work/$workId` renders the existing primary Session conversation inside a Work-owned surface
- [ ] Direct `/chat/$sessionId` navigation for a primary Work thread replace-navigates to `/work/$workId`; ordinary Chat URLs remain unchanged
- [ ] Right Aside conditionally exposes a Work tab with Objective, Execution, Handoff, and Delivery sections
- [ ] The Work tab is selected once when a Work surface activates, and later user tab selection survives Work-detail refreshes
- [ ] Prepared committed changes produce an in-place Ready to submit card while remaining local
- [ ] Draft PR creation/update produces an in-place Ready for review handoff card
- [ ] Repeated Work submit requires another explicit user action and updates the same open PR and latest handoff notes
- [ ] Source-dirty, missing-worktree, GitHub-auth, PR-update, and first-response failures have recoverable in-context UX
- [ ] Remote projection/remote-host files have no diff
- [ ] Session Group server module and schema files have no diff; any web change is limited to sidebar duplicate filtering
- [ ] `pnpm --filter @cradle/server typecheck` exits 0
- [ ] `pnpm --filter @cradle/web typecheck` exits 0
- [ ] `pnpm --filter @cradle/cli typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `git diff --check` prints nothing
- [ ] `plans/README.md` marks Plan 036 DONE or BLOCKED with reason

## STOP conditions

Stop and report; do not improvise if:

- The implementation requires changing remote Session source-of-truth or proxy
  semantics from Plans 033/034.
- A Work cannot be related to a Session without adding Work writes inside the
  Session module. Reassess the `work_threads` ownership rather than adding
  `sessions.workId` casually.
- Drizzle cannot generate the primary-thread uniqueness cleanly without a
  trigger or hand-edited historical migration.
- Clean-source preflight cannot reliably run before creating the first Worktree.
- `startSessionIsolation()` cannot provide failure compensation without a
  broader destructive rewrite of worktree cleanup.
- Pull-request readiness needs Git semantics that conflict with existing
  session-bound PR behavior.
- The web change requires replacing the entire New Chat composer or navigation
  model instead of extracting a narrow reusable composer boundary.
- Any focused verification fails twice after a reasonable correction.
- Any out-of-scope file must be changed to make the plan work.

## Maintenance notes

- This plan intentionally validates the Work product model using only local
  managed worktrees. A later Cloud/Remote plan should add an explicit Execution
  record/provider only after the local Work UX is proven; do not pre-build that
  interface here.
- The current PR binding remains stored by the pull-request module through the
  primary Session. A later persistence cleanup may move it to a Work-owned link
  table, but doing so now would mix product validation with a data migration.
- Existing Sessions with worktrees are not Work. Do not infer Work membership
  from `session.worktreeId`; membership exists only through `work_threads`.
- Work activity is a projection. Reviewers should reject any future patch that
  starts persisting labels such as `running`, `reviewing`, or `waiting` on Work.
- If a Work dashboard or multiple threads become necessary, add them as
  separate plans after this path is used in practice.
