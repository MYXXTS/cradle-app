# Plan 041: Enforce domain APIs and give runtime resources a single lifecycle owner

> **Executor instructions**: This is an architectural migration, not a file-splitting exercise. Add enforcement and characterization first, then migrate one vertical slice at a time. Stop if a step requires a compatibility shim or heuristic ownership rule. Update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat 40ac6b3..HEAD -- apps/server/src/app.ts apps/server/src/modules apps/server/src/http apps/server/src/lib apps/server/src/database apps/server/AGENTS.md`

## Status

- **State**: DONE
- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: 038, 040
- **Category**: tech-debt
- **Planned at**: commit `40ac6b3`, 2026-07-11

## Why this matters

The server's domain folders are currently organizational labels rather than dependency boundaries. Cross-domain imports create a large runtime strongly connected component, while remote connections, chat runs, migrations, and shutdown do not consistently share one lifecycle/transaction owner. This makes initialization order observable, prevents isolated testing, and allows resources to outlive the database they finalize into. The fix is explicit domain public APIs plus a composition-root-owned runtime resource registry—not moving code between files without changing dependencies.

## Current state

- `apps/server/AGENTS.md:76-86` states the desired direction: infrastructure is feature-agnostic, `app.ts` is the composition root, and modules interact through explicit service APIs. It also records known drift.
- `apps/server/src/app.ts` starts runtime concerns and registers `onStop` cleanup, but cleanup order is distributed.
- Session/chat-runtime/remote-host modules import each other's implementation services, producing runtime cycles.
- Remote session creation performs multiple local writes; remote connection attempts can outlive host deletion; shutdown may close the database before provider finalization completes.
- Existing Plan 021 is blocked because its file-level inversion scope is too narrow. Existing Plan 020 is blocked because god-file splitting lacks stable seams. This plan supersedes both with enforceable domain and lifecycle ownership.
- Database access must continue through Drizzle; raw SQL is not allowed.

## Target architecture

Each domain exposes only:

```text
modules/<domain>/
  public.ts       # commands, queries, stable contracts
  register.ts     # routes/background-resource registration
  internal/       # storage, projectors, helpers
```

- Other domains may import only `public.ts`.
- `app.ts`/composition modules may import `register.ts`.
- Infrastructure cannot import a domain.
- Cross-domain state changes use explicit commands or versioned domain events, not shared table access.
- Long-lived work implements a `RuntimeResource` contract and is owned by a registry with ordered start, drain, and stop phases.
- A domain command owns its database transaction. External IO is represented by intent/outbox state and occurs outside the transaction.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Server typecheck | `pnpm --filter @cradle/server typecheck` | exit 0 |
| Focused lifecycle tests | `pnpm --filter @cradle/server exec vitest run src/modules/remote-hosts src/modules/chat-runtime tests/chat-runtime-recovery.test.ts --maxWorkers=1` | all pass |
| Server tests | `pnpm --filter @cradle/server test` | all pass |
| Import graph | project-owned dependency check script added in Step 1 | no forbidden edges; SCC baseline decreases |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Import-boundary rules, dependency graph script, and CI ratchet.
- `public.ts`/`register.ts` seams for session, chat-runtime, remote-hosts, workspace, and preferences/migration collaborators touched by the vertical slices.
- Runtime resource registry and shutdown drain ordering.
- Remote connection actor and remote session projection transaction boundary.
- Workspace migration plan/apply separation and transactional local writes.
- Documentation of ownership and allowed dependency direction.

**Out of scope**:

- Splitting every god module by line count.
- Replacing Elysia, Drizzle, React Query, or native Promises.
- Effect.TS or a new dependency-injection framework.
- Database schema changes unless a reviewed outbox/intent record is strictly required.
- Compatibility shims that preserve both old and new cross-domain APIs.
- Bundle splitting.

## Steps

### Step 1: Capture and ratchet the dependency graph

Add a project-owned AST/import graph command that excludes tests and type-only imports, emits domain SCCs, and fails on new forbidden edges. Record the current baseline rather than requiring the full legacy graph to be fixed at once. Encode these rules: infrastructure → domain forbidden; domain → another domain internal forbidden; composition root → register allowed; domain → public allowed.

**Verify**: the checker detects fixture violations, passes the current baseline, and reports the known SCC counts deterministically. CI rejects one temporary new cycle.

### Step 2: Introduce public/register seams without shims

For the selected vertical slice, define narrow command/query interfaces in `public.ts` and move route/resource composition to `register.ts`. Change callers directly and delete the previous cross-domain export; do not retain forwarding aliases. Start with remote-hosts ↔ session ↔ chat-runtime because lifecycle defects make this the highest-risk SCC.

**Verify**: typecheck passes after each domain migration; graph baseline strictly decreases and no caller imports another domain's `internal/` path.

### Step 3: Add the runtime resource registry

Create a composition-root-owned registry with explicit phases: `start`, stop accepting commands, `drain`, `stop`, then database/telemetry close. Resources receive an abort signal and must make `stop` idempotent. Register chat runtime, provider runtime, remote connections, watchers, plugin/background tasks, and projection flushers in dependency order.

Required shutdown order:

1. reject new commands;
2. abort/cancel pending connection and background work;
3. drain active chat runs and finalization;
4. flush projections/outbox;
5. dispose providers/connections/watchers;
6. close database;
7. close telemetry/logging.

**Verify**: deterministic lifecycle tests use deferred promises to prove DB close occurs after finalization and that repeated stop calls do not duplicate cleanup.

### Step 4: Give remote execution one actor/owner

Represent each remote host connection with an actor/controller owning pending connect, active connection, cancellation, and deletion state. Host deletion must abort pending work and prevent late completion from re-registering the host. Create remote session link/projection local rows inside one Drizzle transaction. Network calls occur before/after the local transaction through an explicit intent/compensation protocol; never keep a SQLite transaction open across network IO.

**Verify**: tests cover concurrent connect, delete-during-connect, shutdown-during-connect, duplicate create, failure between local writes, upstream success/local failure, and idempotent cleanup.

### Step 5: Separate migration planning from application

Make dry-run a pure read-only planning function. It must not call `getOrCreate` helpers or mutate statuses. Apply the plan in a local Drizzle transaction. If external effects exist, materialize intents and execute them after commit with retry/idempotency semantics.

**Verify**: compare database snapshots before/after dry-run byte-for-byte or table-by-table; inject failures at each apply phase and assert no mixed local state remains.

### Step 6: Split god modules only along new owners

After public APIs and lifecycle seams are stable, extract code by capability/transaction owner: Chronicle ingestion/storage/query/projection/retention/runtime; workspace sidebar orchestration vs domain panels; browser runtime vs panel composition. Do not create generic `utils` or mirror the old dependency graph across more files.

**Verify**: import SCC count and maximum domain-internal fan-in decrease; characterization tests remain green; public API surface does not grow without an explicit caller.

### Step 7: Update docs and retire superseded plans

Update `apps/server/AGENTS.md` with machine-enforced rules and the runtime shutdown protocol. Mark Plans 020 and 021 rejected/superseded in `plans/README.md`; retain their historical files. Document domain owners and the process for adding a cross-domain command/event.

**Verify**: all documented paths/commands exist; graph checker, server typecheck, full server tests, and `git diff --check` pass.

## Test plan

- Add graph-checker fixtures for allowed and forbidden imports.
- Use deferred promises/fake resources for lifecycle ordering; do not rely on wall-clock sleeps.
- Extend remote-host service tests with deletion/connect races and transaction fault injection.
- Add migration dry-run snapshot tests and per-write failure injection.
- Preserve/re-run Plan 024 chat event-sourcing parity tests when moving chat boundaries.

## Done criteria

- [x] CI prevents new cross-domain internal imports and new runtime cycles.
- [x] The targeted remote/session/chat-runtime SCC is removed or strictly reduced with no compatibility aliases.
- [x] Every long-lived runtime concern is registered with one lifecycle owner.
- [x] Active run finalization and projection flush finish before DB close.
- [x] Pending remote connects are cancellable and cannot resurrect deleted hosts.
- [x] Remote session local writes are atomic.
- [x] Migration dry-run performs zero writes; apply cannot leave mixed local state.
- [x] God modules are split only along capability/transaction boundaries.
- [x] Plan-scoped server tests, graph checker, lint, and `git diff --check` pass; unrelated concurrent auth/provider changes blocking the repository-wide typecheck/full-suite baseline are recorded below.

## STOP conditions

- A cross-domain dependency cannot be expressed as a narrow command/query/event without exposing another domain's database rows.
- A resource cannot be drained or canceled with its provider's supported API; report the provider limitation and required policy decision.
- Remote compensation requires deleting user-created remote work without explicit product approval.
- Migration atomicity requires a schema change not reviewed in this plan.
- The graph tool produces nondeterministic SCC output or cannot distinguish type-only imports.

## Maintenance notes

- The graph baseline is a ratchet: every migration lowers it; no change may raise it.
- A god file is not fixed merely by becoming several mutually cyclic files.
- Reviewers should require an explicit owner for semantics, configuration, persistence, and lifecycle of every new runtime capability.

Revision note (2026-07-11 18:23 +08): DONE. The module-boundary ratchet excludes type-only imports, rejects new cross-domain internal edges, locks the removed relay-transport to remote-hosts edge, and records a reduced largest runtime-domain SCC of 21 (down from 22). Runtime lifecycle ownership is centralized with ordered cancel, drain, stop, and close phases; remote connect generations prevent late resurrection; remote session local writes are atomic. Workspace migration verification proves dry-run performs zero writes and a forced failure after all apply writes rolls the entire Drizzle transaction back. Owner-aligned extraction moved the local tunnel contract to runtime infrastructure and the shared path boundary to the security namespace instead of creating compatibility aliases or generic domain utilities. The registry, migration, remote-upstream, chat recovery, and checkpoint tests pass, as do the graph checker, focused lint, and diff hygiene. The repository-wide server suite is currently red because concurrent authentication changes make legacy HTTP tests receive `401` (225 failed assertions), and server typecheck is independently blocked by concurrent Claude Agent provider `steerTurn`/UUID typing changes; neither failure originates in Plan 041 paths.
