# Plan 040: Establish server projections as the only web business-state authority

> **Executor instructions**: Execute this plan incrementally, beginning with chat messages. Do not perform a repo-wide mechanical rewrite. Run each verification gate and update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat 40ac6b3..HEAD -- apps/web/src/features/chat apps/web/src/store/chat apps/web/src/lib apps/web/src/hooks apps/web/src/features/settings apps/web/src/features/session`

## Status

- **State**: DONE
- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 038
- **Category**: tech-debt
- **Planned at**: commit `40ac6b3`, 2026-07-11

## Why this matters

The same server-owned state is currently represented by React Query, Zustand, IndexedDB, live sync transports, and generated SDK call sites. Because no layer has explicit precedence, an IndexedDB message cache can restore stale rows after the server has authoritatively returned an empty snapshot, mutations can disagree on error semantics, and invalidation is fragmented. The web architecture must distinguish server projections, ephemeral UI state, and provisional durable cache.

## Current state

- `apps/web/src/features/chat/session/use-chat-session-driver.ts:158-196` restores IndexedDB rows whenever the Zustand message list is empty; empty does not distinguish loading from an authoritative empty server snapshot.
- `apps/web/src/features/chat/session/stable-message-cache.ts:1-39` stores only `{ sessionId, cachedAt, rows }`; no server revision or tombstone exists.
- Chat messages are also stored in `apps/web/src/store/chat/` and refreshed by sync events.
- `apps/web/src/lib/client.config.ts:14-17` discourages direct generated-client usage but does not enforce a domain gateway.
- Existing Plan 024 made server chat facts/projections versioned. Reuse those server versions instead of inventing a client-only sequence.
- Existing Plan 023 is blocked and recommends generated hooks as the end state. This plan supersedes that direction: generated code is transport infrastructure; feature-owned gateways are the public API.

## Target architecture

| State class | Owner | Allowed contents |
| --- | --- | --- |
| Persistent business state | server domain + database | sessions, messages, issues, preferences |
| Server projection cache | feature gateway backed by React Query | snapshots and mutation results |
| Ephemeral UI state | Zustand | selection, panels, drafts, transient rendering state |
| Durable startup cache | IndexedDB | versioned provisional snapshots only |
| Live transport | sync engine | versioned deltas/invalidation, never independent authority |

Every feature imports its own `features/<domain>/api/` gateway. The gateway owns query keys, envelope decoding, non-2xx throwing, optimistic rollback, invalidation, and local/remote routing. Non-generated components/hooks must not import `api-gen` directly.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web typecheck | `pnpm --filter @cradle/web typecheck` | exit 0 |
| Focused chat tests | `pnpm --filter @cradle/web exec vitest run src/features/chat src/store/chat --maxWorkers=1` | all pass |
| Focused settings/session tests | `pnpm --filter @cradle/web exec vitest run src/features/settings src/features/session --maxWorkers=1` | all pass |
| Full web tests | `pnpm --filter @cradle/web test` | all pass |
| Import boundary | `rg -l "api-gen" apps/web/src --glob '!api-gen/**' --glob '*.ts' --glob '*.tsx'` | only approved gateway/transport files |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Chat message snapshot/cache/sync path.
- A reusable feature-gateway convention and lint/import restriction.
- Session pull-request envelope/error correction as the first non-chat gateway exemplar.
- Settings preference mutations, changed to field-level commands or revision-aware updates.
- Migration of directly touched components away from `api-gen`.

**Out of scope**:

- Migrating every feature in one PR.
- Storing server business entities in a new global Zustand store.
- Treating IndexedDB as an offline write queue.
- Replacing React Query.
- Bundle splitting or visual UI changes.
- Server event-sourcing redesign; Plan 024 already owns it.

## Steps

### Step 1: Define and enforce the gateway contract

Create a documented `features/<domain>/api/` convention. Add a single transport adapter that converts every non-2xx generated response into the existing web error contract and unwraps envelopes at the boundary. Add ESLint/import-boundary enforcement so feature UI cannot add new direct `api-gen` imports; initially allowlist existing unmigrated sites and make the count non-increasing.

**Verify**: a fixture gateway test covers success, typed non-2xx error, invalid response, envelope unwrapping, and cancellation; lint fails for a temporary forbidden import.

### Step 2: Version chat snapshots and durable cache

Expose/use the authoritative server session projection revision. Change the IndexedDB record to include schema version, session revision, and snapshot state. Cache hydration is provisional only until the server responds. Any server snapshot, including zero rows, replaces provisional data. Store a tombstone/revision on clear, rollback, or deletion so an older cache cannot resurrect messages.

Do not compare wall-clock timestamps across server and browser. Ordering must use the server revision.

**Verify**: focused tests cover cold-cache display, authoritative empty snapshot, rollback to empty, deleted session, stale cache revision, newer server revision, and malformed/old IndexedDB records.

### Step 3: Make live sync update the projection, not own state

Route sync frames through the chat gateway/query projection. Versioned deltas apply only to the expected revision; gaps trigger a snapshot refetch. Zustand may retain transient streaming/render state, but stable server message rows must be selected from one projection. Remove duplicated stable rows from Zustand after consumers migrate.

**Verify**: reconnect/gap tests prove no duplicate or resurrected messages and snapshot refetch occurs on revision mismatch.

### Step 4: Add session and preferences exemplars

Move pull-request reads/mutations behind `features/session/api/`; unwrap `{ pullRequest }` once and make HTTP errors throw before optimistic success handlers. For preferences, replace whole-object writes with field-level PATCH commands when supported. If the server contract cannot change in this plan, add revision/ETag compare-and-set and surface a conflict instead of silently overwriting.

**Verify**: tests cover PR absent/present envelopes, non-2xx rollback, two concurrent preference field updates, and conflict handling.

### Step 5: Publish migration rules and ratchet imports

Document ownership and add a machine-readable allowlist/baseline for remaining direct generated imports. Every migrated feature reduces the baseline; CI rejects increases. Mark Plan 023 rejected/superseded in the index because generated hooks are no longer the feature boundary.

**Verify**: import-boundary command and lint pass; full web tests and typecheck pass.

## Test plan

- Model cache tests after existing stable-message-cache and chat sync-engine tests.
- Use fake IndexedDB; assert both rendered/projection state and persisted record revision.
- Add mutation adapter tests that return HTTP 400/409/500 and verify `onSuccess` is not invoked.
- Add a two-writer preferences test using deferred promises to force completion order.
- Avoid browser E2E; the critical behavior is deterministic at gateway/cache level.

## Done criteria

- [x] Server business state, UI state, durable cache, and transport ownership are documented and enforced.
- [x] An authoritative empty message snapshot always clears provisional cached rows.
- [x] IndexedDB records carry server revision and tombstone semantics.
- [x] Live-sync gaps refetch instead of applying ambiguous deltas.
- [x] PR envelope and generated-client error semantics are fixed through gateways.
- [x] Concurrent preference updates cannot silently lose unrelated fields.
- [x] Direct `api-gen` import count cannot increase and touched features use gateways.
- [x] Web typecheck and full tests pass; `git diff --check` is clean.

## STOP conditions

- The server exposes no monotonic session projection revision usable by the client.
- Stable streaming rows cannot be removed from Zustand without a render-performance regression that lacks a measurable characterization test.
- Preferences require a public contract change but server changes are excluded from the executing change set.
- The chosen generated client cannot expose raw status/error data without editing generated files.

## Maintenance notes

- New features must start with a gateway; generated SDK imports are implementation details.
- A durable cache is allowed to improve startup rendering, never to win a conflict with an authoritative server response.
- Reviewers should reject query keys or invalidation logic declared inside UI components.

Revision note (2026-07-11 18:23 +08): DONE. The chat message contract returns the authoritative session-event revision with snapshot rows; the durable cache stores schema version, revision, and explicit present/empty state; event-tail subscription starts from the snapshot revision and refetches on gaps; session pull-request, settings preference, and workspace file-children calls use feature gateways backed by the generated authenticated client. Web typecheck enforces a non-increasing baseline of 186 non-gateway generated imports and an exact allowlist of 23 transport/external/binary raw-fetch calls, so the direct `fetch()` workspace file-children regression cannot return. A deferred two-writer preferences test proves unrelated field updates are serialized without lost writes. Final verification passed web typecheck, boundary checks, diff hygiene, and the full web suite (88 files / 399 tests).
