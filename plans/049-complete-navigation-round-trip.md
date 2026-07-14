# Plan 049: 完成 Navigation surface 无损 round-trip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e3d008c..HEAD -- apps/web/src/navigation apps/web/src/routes apps/web/src/features/diff-review/shared/navigation.ts apps/web/src/features/new-chat`
> Any semantic change to route search schemas, surface identity, persistence,
> tear-off restore, or navigation commands is a STOP condition until the route
> matrix below is reconciled.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/040-establish-web-state-authority.md` (DONE)
- **Category**: correctness, tech-debt, tests
- **Planned at**: commit `e3d008c`, 2026-07-14

## Why this matters

Navigation 当前用 `SurfaceRoute`、`surfaceDraftFromRoute`、Zod persistence schema、navigation commands 和 restore adapter 重复实现同一协议，已经出现三类静默丢失：New Chat 的 `workspaceId/sessionGroupId`、Diff 的 `line/side`，以及 reload 后被 validator 丢弃的 Plugin Center surface。

目标状态是一个 Navigation-owned lossless route codec：authoritative schema 同时定义 route data、identity/persistence validation 和 router restore；router、Zustand storage、tear-off window 只是 adapters。任何决定不持久化的 transient field 都必须是显式 policy，而不是漏字段。

## Current state

- `apps/web/src/routes/chat/new.tsx` 接受 `issueId`、`workspaceId`、`sessionGroupId`。
- `apps/web/src/navigation/navigation-commands.ts:56-88` 写入三者，但 `surface-identity.ts` 的 `/chat/new` type 只允许 `issueId`，且 `surfaceDraftFromRoute` 完全丢弃 search。
- `apps/web/src/features/diff-review/shared/navigation.ts:5-26` 写入 `line/side`，但 diff `SurfaceRoute` 与 persistence schema 均未建模。
- `surface-identity.ts` 建模 `plugin-center` 与 `/plugins`；`surface-store.ts:43-105` 的 route/kind schemas 缺少它，reload 时合法 surface 被过滤。
- `navigation-commands.ts:26-32` 用 `as RouterNavigateOptions` 隐藏 route union 与 TanStack Router options 的类型漂移。
- `apps/web/src/navigation/surface-store.test.ts` 覆盖 corruption recovery/store behavior，但没有全 surface route → persist → restore matrix。

仓库允许 breaking refactor：bump persistence version 并删除旧的不完整 snapshot，不写 compatibility shim。保留用户业务数据不在本 Plan 范围；surface tabs 是可重建 UI state。

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Navigation tests | `pnpm --filter @cradle/web exec vitest run src/navigation` | all tests pass |
| Diff helper tests | `pnpm --filter @cradle/web exec vitest run src/features/diff-review/shared` | all matching tests pass |
| Web typecheck | `pnpm --filter @cradle/web typecheck` | exit 0 without navigation cast |
| Scoped lint | `pnpm exec eslint apps/web/src/navigation apps/web/src/features/diff-review/shared/navigation.ts apps/web/src/routes/chat/new.tsx` | exit 0 |
| Drift grep | `rg -n "as RouterNavigateOptions|cradle:surfaces:v1" apps/web/src/navigation` | no matches |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Navigation route/surface codec, schemas, identity validation and restore options
- New Chat context fields: `issueId`, `workspaceId`, `sessionGroupId`
- Diff deep-link fields: existing search plus `line` and `side`
- Plugin Center surface persistence
- persistence version bump and explicit reset of v1 snapshots
- navigation/store/tear-off focused pure tests and README

**Out of scope**:

- TanStack Router replacement or route-tree redesign
- visual Surface Bar behavior
- persisting Settings overlay as a normal surface
- changing domain semantics of New Chat, Diff, Plugin, or Kanban
- preserving v1 surface snapshots through a compatibility migration
- browser/E2E tests

## Git workflow

- Branch: `advisor/049-complete-navigation-round-trip`
- Suggested commit: `refactor(navigation): own lossless surface routes`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Build an exhaustive route matrix test

Before refactoring, enumerate every `SurfaceKind` and representative route, including optional search variants. For each persistable surface assert:

`router state -> surface draft -> persisted JSON -> validated surface -> router navigate options`

preserves `to`, `params`, and all policy-approved search fields. Include plugin-center, all New Chat context fields, global/workspace Diff with `line/side`, Plugin detail, Kanban filters, and parameterized routes. Separately assert Settings remains overlay-only if that is current policy.

Use compile-time exhaustiveness for the kind/route matrix; do not hand-maintain an untyped array that can silently omit future kinds.

**Verify**: tests expose the three known drifts before production changes.

### Step 2: Establish one authoritative route codec

Create a Navigation-owned module whose discriminated schemas define every supported route and search shape. Infer `SurfaceRoute` and related types from those schemas instead of independently maintaining TypeScript and Zod unions.

The codec must provide narrow operations for router-state decode, persisted decode, and router-options encode. Validate correlated `kind`, `id`, and `route`: a record cannot claim `kind: 'chat'` with a Plugin route or an ID derived from another resource.

Preserve existing stable IDs and titles. Titles are presentation metadata, not part of route identity.

**Verify**: malformed kind/id/route combinations are rejected; all valid matrix rows round-trip.

### Step 3: Complete New Chat and Diff policy

Model and decode `/chat/new` search with `issueId`, `workspaceId`, and `sessionGroupId`. Keep undefined normalization stable so equivalent empty search values do not cause repeated surface updates.

Add `line` and `side` to both global and workspace Diff routes using the exact router schema types. The selected policy is to persist them: they are user navigation context and a restored deep link should focus the same location. Validate allowed `side` literals from the route owner rather than accepting arbitrary strings.

**Verify**: both direct router entry and command-created surfaces restore identical New Chat/Diff context.

### Step 4: Complete Plugin Center and all remaining kinds

Add `/plugins` + `plugin-center` to authoritative validation. Audit the matrix for every current `SurfaceKind`; close any additional mismatch found instead of limiting the change to the three examples.

Keep Settings exclusion explicit in normalization and test it as policy. Do not persist transient modal/overlay state by accident.

**Verify**: Plugin Center survives serialize/reload; every declared kind is either round-tripped or explicitly classified non-persistable.

### Step 5: Remove router casts and migrate adapters

Make `navigateToSurface`, open commands, route sync, persistence and tear-off restore consume codec operations. `toRouterNavigateOptions` must typecheck without `as RouterNavigateOptions`; if TanStack Router expects a narrower discriminated union, preserve discrimination through the encoder rather than widening records.

Adapters must not inspect or rebuild route-specific search. They may attach `replace` and window/surface metadata only.

**Verify**: the drift grep has no cast; Web typecheck proves all encoded routes fit the actual router contract.

### Step 6: Break old persistence cleanly and document extension rules

Bump the storage key/version and discard v1 snapshots through the existing corruption/reset path. Do not add a field-by-field migration for incomplete old routes. Update Navigation README with the codec boundary, persistence policy, Settings exception, and checklist for adding a route/surface.

**Verify**: v1 data resets to Home; v2 valid data restores; corrupted/mismatched data still recovers. Run all commands above.

## Test plan

- Exhaustive surface matrix with compile-time kind coverage.
- Known regressions: New Chat 3-field search, Diff `line/side`, Plugin Center reload.
- Correlation validation: wrong kind/route/id, malformed params/search, duplicate IDs.
- Persistence: v1 reset, v2 restore, corruption recovery, Settings exclusion.
- Adapter parity: direct router entry, navigation command, restored/tear-off navigation produce the same route.
- No browser or visual component tests.

## Done criteria

- [ ] One schema/codec owns route decode, surface validation, persistence and router encode.
- [ ] `SurfaceRoute` is derived rather than duplicated beside validation schemas.
- [ ] Every `SurfaceKind` has an explicit persistable/non-persistable policy.
- [ ] New Chat, Diff anchors, and Plugin Center round-trip without data loss.
- [ ] kind/id/route correlation is validated.
- [ ] Navigation contains no `RouterNavigateOptions` cast hiding drift.
- [ ] persistence version is bumped; no compatibility shim is retained.
- [ ] focused tests, typecheck, lint, and diff check pass.
- [ ] Navigation docs and `plans/README.md` are updated.

## STOP conditions

- Product explicitly requires Diff anchors to be transient; stop and record the alternative policy/test before implementation.
- A route's search schema cannot be imported or represented without creating a navigation↔feature cycle; stop and move the shared contract to the actual route owner.
- Removing the router cast requires weakening types to `unknown` or accepting arbitrary records; stop and fix the codec boundary.
- A new persistence migration is required to preserve irreplaceable user data; stop because surfaces were assumed reconstructible.
- Tear-off windows use a materially different route protocol than the main router; stop and split an adapter contract, not the authority.
- Any verification fails twice for the same reason.

## Maintenance notes

- Adding a route requires one codec entry and one matrix fixture; never edit a separate TypeScript union and validator.
- Omitted search fields are a reviewed persistence decision, not an implementation shortcut.
- Navigation owns round-trip mechanics; feature domains own the meaning of their search values.
