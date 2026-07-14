# Plan 050: 收敛 Session projection 与 cache coherence

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e3d008c..HEAD -- apps/web/src/features/workspace/use-session.ts apps/web/src/features/workspace/global-session-sync-engine.ts apps/web/src/features/workspace/use-global-session-event-sync.ts apps/web/src/hooks/use-global-event-listeners.ts apps/web/src/features/desktop-tray apps/web/src/features/new-chat apps/web/src/features/workspace-detail apps/web/src/features/chat/runtime`
> Changes to Session query keys, event payloads, optimistic create/start, archive,
> read state, runtime status, or queue refresh are a STOP condition until mapped
> into the semantic transition table below.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/040-establish-web-state-authority.md` (DONE)
- **Category**: correctness, tech-debt, tests
- **Planned at**: commit `e3d008c`, 2026-07-14

## Why this matters

Plan 040 established React Query/server projection authority, but Session cache topology is still known by global listeners, tray actions, New Chat, Workspace Detail and sync hooks. A concrete failure exists: `SnapshotRequired` discards the triggering Session identity and only invalidates lists, while an open renderer reads a separate detail cache and runtime status does not poll by default. After an event gap, title/archive/runtime/queue can remain stale indefinitely.

目标状态是在 Session feature 内建立 projection gateway。External adapters submit semantic facts such as created, changed, archived, read, runtime-changed, or gap-recovery; gateway alone owns query keys, optimistic writes, rollback, filtered-list membership and refresh coalescing。React Query remains the only business projection authority，不新增 Zustand Session 副本。

## Current state

- `apps/web/src/features/workspace/global-session-sync-engine.ts:93` receives a `SnapshotRequired` event but calls a no-argument callback, losing session identity.
- `use-global-session-event-sync.ts:50` recovers only `getSessions` lists; normal events at `:75` also target detail and runtime/queue projections.
- `apps/web/src/features/chat/session/chat-session-route-content.tsx:98` consumes `getSessionsById`; stale archive/title directly affects UI lifecycle and title.
- `apps/web/src/features/chat/runtime/use-runtime-session-status.ts:19` disables default polling.
- `features/workspace/use-session.ts:87-227` owns query-key recognition, list/detail patching and unread snapshot beside workspace UI hooks.
- `hooks/use-global-event-listeners.ts:26-92` and `features/desktop-tray/use-desktop-tray-action-bridge.ts:49-99` duplicate overlapping refresh sets.
- `features/new-chat/new-chat-page.tsx:298-329` and `features/workspace-detail/workspace-detail-page.tsx:470-565` directly patch/invalidate Session lists multiple times per create/start flow.
- Current tests cover event sequencing and a few list-row promotions, not QueryClient-level cross-cache coherence or gap recovery.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Session tests | `pnpm --filter @cradle/web exec vitest run src/features/session src/features/workspace/use-session.test.ts src/features/workspace/global-session-sync-engine.test.ts` | all matching tests pass |
| Web typecheck | `pnpm --filter @cradle/web typecheck` | exit 0 |
| Scoped lint | `pnpm exec eslint apps/web/src/features/session apps/web/src/features/workspace/use-session.ts apps/web/src/features/workspace/use-global-session-event-sync.ts apps/web/src/hooks/use-global-event-listeners.ts apps/web/src/features/desktop-tray apps/web/src/features/new-chat/new-chat-page.tsx apps/web/src/features/workspace-detail/workspace-detail-page.tsx` | exit 0 |
| Ownership grep | `rg -n "invalidateQueries|setQueryData" apps/web/src/features/desktop-tray apps/web/src/hooks/use-global-event-listeners.ts apps/web/src/features/new-chat/new-chat-page.tsx apps/web/src/features/workspace-detail/workspace-detail-page.tsx` | no Session cache topology remains in adapters/pages |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Session feature projection gateway and semantic transition API
- list/detail/runtime/queue query-key ownership and filtered variants
- gap recovery with targeted and controlled global refresh
- existing optimistic create/start, read/unread, archive/restore transitions and rollback
- migration of global event, tray, New Chat and Workspace Detail call sites
- pure QueryClient/fake-event tests and ownership docs

**Out of scope**:

- replacing React Query or adding a Zustand Session store
- Server Session/event protocol redesign
- changing event sequence/dedup algorithm except preserving `SnapshotRequired` identity
- message snapshot/version ownership already completed by Plan 040
- UI redesign or browser tests
- unrelated Workspace feature extraction

## Git workflow

- Branch: `advisor/050-own-session-projection-cache`
- Suggested commit: `refactor(session): centralize projection coherence`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Characterize semantic transitions with a real QueryClient

Create a pure gateway test harness using a real QueryClient and deterministic deferred fetches. Preload detail, active/archived lists, workspace-filtered lists, runtime status and queue projections. Define expected outcomes for:

- created/start accepted/start failed rollback;
- changed/title/provider/runtime settings;
- archived/restored list membership;
- read/unread detail and list rows;
- runtime/queue event;
- session-targeted `SnapshotRequired`;
- identity-less transport recovery.

Assert observable cache state and refresh count, not private query-key array shapes. Characterize current optimistic-first rendering before moving it.

**Verify**: targeted gap test fails because current recovery leaves detail/runtime/queue stale.

### Step 2: Establish the Session projection gateway

Create `apps/web/src/features/session/api/` (or the existing Session-owned API namespace if one landed) as the sole owner of Session query keys and cache mutation. Expose semantic operations, for example `projectCreatedSession`, `applySessionChanged`, `applyReadResult`, `applyArchived`, `refreshAfterRuntimeEvent`, and `recoverProjectionGap`.

Names may follow existing feature conventions, but callers must not pass raw query keys or choose list/detail/runtime targets. Gateway operations accept domain identifiers/facts and a QueryClient dependency. Keep transport query functions separate from projection transitions where that improves testing.

Move the renderer projection out of Workspace ownership without inventing a new DTO if generated/existing Session types already suffice.

**Verify**: gateway tests pass for normal transitions; no second business state store exists.

### Step 3: Repair snapshot-gap recovery first

Change the sync engine callback contract to carry the `SnapshotRequired` event/session identity. For a known session, gateway recovery invalidates/coherently refreshes that session's list membership, detail, runtime and queue projections. For an identity-less transport error, inspect existing Session projection queries and schedule one deduplicated global refresh wave.

Coalesce concurrent/repeated recovery so one gap does not cause a request storm. Do not use timeout heuristics; use in-flight promise/state ownership or QueryClient's existing coalescing semantics. Recovery failure remains observable/retryable and must not mark stale data fresh.

**Verify**: targeted and global recovery tests converge all preloaded projections; repeated recovery triggers one semantic refresh wave.

### Step 4: Migrate event and native adapters

Make `use-global-session-event-sync`, global chat event listeners and desktop tray bridge translate their inputs into gateway semantic calls. Remove duplicated lists of invalidations from those adapters. Preserve non-Session effects such as messages, settings or UI slots in their actual owners; do not make Session gateway a general application cache service.

Normal server tail and equivalent native/tray facts must yield identical Session projection results.

**Verify**: parity tests feed equivalent facts through both adapters and compare final Session projections.

### Step 5: Migrate optimistic page flows

Move New Chat and Workspace Detail create/start projection writes, accepted/settled refresh, rollback and list ordering into gateway operations. Preserve optimistic-first surface creation and existing error UX. Remove repeated invalidation at page callback boundaries.

Archive/restore and read/unread call sites must also use semantic operations. Filtered active/archived/workspace list variants must converge without each page knowing query filters.

**Verify**: create success/error, start accepted/error, archive/restore and read/unread tests produce consistent detail/list state and one bounded refresh sequence.

### Step 6: Ratchet ownership and document extension rules

Move or re-export hooks so feature consumers have a stable Session namespace; remove legacy workspace-owned cache helpers after all callers migrate. Add a focused lint/grep ratchet or architecture test preventing named external adapters/pages from importing generated Session query keys or mutating Session cache directly.

Update Session and Workspace READMEs with authority, semantic operations, event adapters, recovery policy and rollback rules.

**Verify**: ownership grep has no Session cache topology in migrated callers; full scoped tests/typecheck/lint/diff check pass.

## Test plan

- QueryClient contract: create/start success and failure rollback, title/change, archive/restore, read/unread.
- List variants: active, archived, workspace-filtered and unfiltered membership/order.
- Event recovery: targeted `SnapshotRequired`, identity-less transport error, repeated/concurrent coalescing, recovery failure.
- Projection families: detail, runtime, queue, lists.
- Adapter parity: server event tail and native/tray fact lead to the same projection.
- No component/browser tests.

## Done criteria

- [ ] Session feature owns query keys, optimistic projection and invalidation semantics.
- [ ] `SnapshotRequired` preserves identity and repairs list/detail/runtime/queue projections.
- [ ] Identity-less recovery performs one controlled global refresh wave.
- [ ] tray/listener/page adapters submit semantic facts and do not know Session cache topology.
- [ ] React Query remains the sole Session business projection authority.
- [ ] create/start rollback, archive filters and read state are covered with real QueryClient tests.
- [ ] duplicate refresh sets and repeated page invalidations are removed.
- [ ] focused tests, typecheck, lint, ownership grep and diff check pass.
- [ ] ownership docs and `plans/README.md` are updated.

## STOP conditions

- A required Session projection is not representable by existing server/generated contracts; stop and report the missing contract instead of inventing a local projection type.
- Correct recovery requires changing server cursor/event semantics; stop and split a Server protocol plan.
- A migration would move messages/settings/UI-slot cache ownership into Session; stop and preserve domain boundaries.
- Optimistic-first navigation cannot be preserved without a product-visible behavior change; stop and document the tradeoff.
- Coalescing depends on debounce/sleep timing rather than explicit in-flight ownership.
- Any verification fails twice for the same reason.

## Maintenance notes

- New Session consumers call semantic projection operations; they never compose raw query keys.
- Add every new Session projection family to targeted/global recovery tests.
- Plan 051 consumes this gateway for association cache coherence and must not recreate invalidation logic.
