# Plan 051: 端到端拥有 Issue–execution association

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e3d008c..HEAD -- apps/server/src/modules/issue apps/server/src/modules/session apps/server/src/modules/session-group apps/server/tests/kanban.test.ts apps/server/tests/session.test.ts apps/web/src/features/kanban apps/web/src/features/workspace/use-session-group.ts apps/web/src/features/session`
> Changes to `linkedIssueId`, Session/Group creation, association routes, or
> linked-query keys are a STOP condition until the invariant and cache matrix
> below is reconciled.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/050-own-session-projection-cache.md`
- **Category**: correctness, architecture, tests
- **Planned at**: commit `e3d008c`, 2026-07-14

## Why this matters

Issue association 目前允许把 workspace A 的 Session/Session Group 链接到 workspace B 的 Issue。直接 link、Session create-with-link、Group create/update-with-link 都只检查记录存在，不检查 workspace invariant。Issue service 还直接写 Session-owned column，而 Session route 反向调用 Issue implementation；Web unlink/relink 只刷新部分 Issue queries，导致 old/new Issue 与 Session detail/list 并行 cache 分裂。

目标状态是 Issue-owned workflow command 拥有关联语义与跨 participant invariant，而 Session/Session Group 通过窄 public commands 写自己的 namespace。所有入口共享同一校验；mutation 返回足够的 before/after association 信息，由 Plan 050 的 Session projection gateway 协调 old/new Issue 和 execution projections。无需 DB migration。

## Current state

- `apps/server/src/modules/issue/README.md` 声明 Issue 拥有 association semantics。
- `apps/server/src/modules/issue/service.ts:1463-1469` 查询 Session + Issue 后直接更新 `sessions.linkedIssueId`，未比较 workspace。
- `apps/server/src/modules/session/service.ts:640-717` create 可直接写 `parsed.linkedIssueId`，未验证 Issue 存在/同 workspace；remote projection path也携带该值。
- `apps/server/src/modules/session-group/service.ts:240-295` create/update 只调用 `Issue.getIssue`，未比较 group workspace。
- `apps/server/src/modules/session/index.ts:172-200` 的 Session routes 反向调用 Issue service，形成 ownership inversion。
- `apps/web/src/features/kanban/use-kanban.ts:1158-1183` link 只刷新 current linked ref 与 new Issue list；unlink 不知道 old Issue，也不更新 Session detail/list。
- Session Group association mutations同样未一致刷新 old/new Issue group lists。
- `apps/server/tests/kanban.test.ts:205-218` 覆盖 happy-path link，但没有 cross-workspace、relink/unlink 或 create-with-link invariant matrix。

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Server association tests | `pnpm --filter @cradle/server exec vitest run tests/kanban.test.ts tests/session.test.ts src/modules/session/service.test.ts src/modules/session-group/service.test.ts --maxWorkers=1` | all tests pass |
| Web projection tests | `pnpm --filter @cradle/web exec vitest run src/features/session src/features/kanban/use-issue-execution-association.test.ts src/features/workspace/use-session-group.test.ts` | new QueryClient association and Session Group projection tests pass |
| Generate clients | `pnpm gen:cli` | generated contracts reflect association responses if changed |
| Server typecheck | `pnpm --filter @cradle/server typecheck` | exit 0 |
| Web typecheck | `pnpm --filter @cradle/web typecheck` | exit 0 |
| Module graph | `pnpm --filter @cradle/server check:module-graph` | exit 0; no new Issue↔Session cycle |
| Scoped lint | `pnpm exec eslint apps/server/src/modules/issue apps/server/src/modules/session apps/server/src/modules/session-group apps/web/src/features/kanban apps/web/src/features/session apps/web/src/features/workspace/use-session-group.ts` | exit 0 |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Session and Session Group ↔ Issue association invariant and ownership
- direct link/unlink/relink plus create/update-with-link entry points
- local and remote-projected Session behavior at the local Issue boundary
- narrow participant write commands; Issue-owned orchestration
- route/generated response changes needed to return before/after refs
- Web association gateway/reconciler using Plan 050 projection API
- focused Server and QueryClient tests; module READMEs

**Out of scope**:

- DB schema or migration
- Issue relation graph, parent/sub-issue, delegation, or agent run tracking
- moving the whole Kanban feature
- cross-workspace associations as a supported product feature
- distributed transaction across separate Cradle hosts
- visual redesign or browser tests

## Git workflow

- Branch: `advisor/051-own-issue-execution-association`
- Suggested commit: `refactor(issue): enforce execution association ownership`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Lock the invariant with a complete Server matrix

Create fixtures for two workspaces, one Issue per workspace, local Sessions and Session Groups. Cover:

- direct Session link, unlink, A→B relink;
- Session create with link;
- Group create and update with link;
- missing target records;
- every cross-workspace combination.

Expected invariant: a non-null `linkedIssueId` is valid only when execution and Issue have the same non-null workspace identity according to current domain contracts. Rejections must leave prior association unchanged and use one stable AppError code/status across entry points.

Clarify null-workspace behavior from existing product semantics in tests before implementation; do not guess with a heuristic.

**Verify**: same-workspace cases pass; cross-workspace and create-with-link tests expose current holes.

### Step 2: Define participant-owned association commands

In Session and Session Group services, add narrow public commands that read the participant, expose its workspace/current linked Issue, and write `linkedIssueId` within that namespace. Commands must return before/after refs needed by the orchestrator and must not import Issue implementation.

Do not expose raw table handles or general patch objects. Preserve participant-level validation such as Session/Group existence and remote projection constraints.

**Verify**: Issue service no longer imports/writes the `sessions` or `sessionGroups` tables directly; module graph has no new reverse cycle.

### Step 3: Make Issue own the workflow and invariant

Implement Issue-owned workflow commands for link/unlink/relink of Session and Group associations. They load the Issue, read participant workspace/current association through the public participant seam, compare workspace identities, then invoke the participant write command.

Route all direct association endpoints through these workflows. For Session/Group create-with-link, separate participant creation from association orchestration while preserving failure atomicity: validate the Issue/workspace before insert, or use the existing transaction boundary so a rejected association cannot leave a partially created execution.

Do not add compatibility code paths that bypass the workflow. No DB migration is required.

**Verify**: all entry points emit the same invariant error and preserve state on rejection; happy paths return old/new association refs.

### Step 4: Resolve remote-projected Session semantics explicitly

For a local Session projection targeting a remote workspace, association is to a local Issue only if the local workspace identities match and existing product semantics permit it. Do not forward local Issue IDs to a remote Cradle host unless a cross-host identity contract already exists.

Characterize current remote create behavior before changing it. If atomic local projection creation cannot be guaranteed around association validation, stop per the condition below rather than adding compensation heuristics.

**Verify**: remote-projected Session tests prove no foreign local Issue ID is sent upstream and no invalid local association is persisted.

### Step 5: Publish mutation results and regenerate clients

Return a compact association transition from link/unlink/update operations: participant kind/id plus previous and next Issue IDs. Use explicit TypeBox models and generated client types; never make Web infer the old Issue by scanning caches.

Keep response free of full Issue/Session records. Regenerate SDK/CLI and inspect changes for only intended route contracts.

**Verify**: generated clients expose typed transition results for Session and Group association mutations; no hand-written Web response type/cast exists.

### Step 6: Centralize Web association reconciliation

Create an Issue-owned association gateway or reconciler that consumes mutation transitions. It must coordinate:

- participant linked ref;
- Session detail and all affected Session lists via Plan 050 semantic projection API;
- Session Group detail/list projections through its owner;
- previous and next Issue linked Session/Group lists;
- Issue detail/count surfaces if those projections embed association data.

Link, unlink and A→B relink use the same reconciler. Mutation hooks no longer manually choose one or two Kanban keys. Failure leaves caches at the server-confirmed pre-mutation state; if optimistic updates are retained, rollback covers every touched projection.

**Verify**: real QueryClient tests preload old/new Issue and participant projections, then assert final coherence for link/unlink/relink and failure.

### Step 7: Ratchet boundaries and document ownership

Remove direct foreign table writes and duplicated Web invalidation. Add module-graph/grep checks where existing enforcement supports them. Update Issue, Session, Session Group and relevant Web READMEs with association owner, invariant, participant commands, mutation result and cache reconciliation.

**Verify**: Server association matrix, Web QueryClient tests, generation, typechecks, module graph, lint and diff check all pass.

## Test plan

- Server Session: link/unlink/relink, create-with-link, missing records, same/cross workspace, unchanged-on-error.
- Server Group: create/update/link/unlink/relink with the same invariant matrix.
- Remote projection: local validation before upstream effects; no foreign Issue ID forwarding.
- Route contracts: typed previous/next association response and stable error mapping.
- Web QueryClient: participant detail/lists, linked ref, old/new Issue Session/Group lists, success/error rollback.
- Dependency test: no direct Issue write to participant tables and no Session→Issue implementation import.

## Done criteria

- [ ] Every non-null association enforces one documented workspace invariant.
- [ ] Direct link and create/update-with-link share the same validation semantics.
- [ ] Issue owns workflow semantics; Session/Group own writes to their namespace.
- [ ] Issue service no longer directly updates participant tables.
- [ ] Rejected association is atomic and leaves previous state unchanged.
- [ ] Mutation responses provide typed previous/next refs.
- [ ] Web link/unlink/relink reconciles participant plus old/new Issue caches through owner APIs.
- [ ] No DB migration or heuristic compensation is introduced.
- [ ] focused tests, generation, typechecks, module graph, lint and diff check pass.
- [ ] ownership docs and `plans/README.md` are updated.

## STOP conditions

- Product requires cross-workspace Issue associations; stop because identity, authorization and UX need a separate design.
- Null-workspace participants have ambiguous semantics not established by existing tests/product behavior; stop and ask for a domain decision.
- Create-with-link cannot be made atomic with existing transaction/service boundaries without changing public creation semantics; stop and propose that breaking contract explicitly.
- Remote association requires a cross-host Issue identity/protocol; stop and split a remote association plan.
- Plan 050 did not land or exposes no semantic Session projection operation; stop rather than duplicating cache invalidation.
- Ownership cleanup creates an Issue↔Session import cycle; stop and introduce/reuse a contracts/ports seam owned by the workflow boundary.
- Any verification fails twice for the same reason.

## Maintenance notes

- New execution types participate through narrow read/write commands; Issue workflow remains the invariant owner.
- Association responses must always identify previous and next Issue for lossless cache reconciliation.
- Any future cross-workspace support is a protocol/product change, not a relaxation of this invariant.
