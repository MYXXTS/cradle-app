# Plan 052: Make Codex app-server provider-owned and thread-multiplexed

> **Executor instructions**: Follow this plan in order. This is a lifecycle and
> routing migration, not a rollback-only patch. Add characterization tests before
> changing ownership, run every verification gate, and stop on any condition in
> "STOP conditions" instead of adding a session-scoped compatibility path. When
> complete, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat c450147..HEAD -- apps/server/src/modules/provider-runtime apps/server/src/modules/provider-targets apps/server/src/modules/chat-runtime-providers/kit/process-host.ts apps/server/src/modules/chat-runtime-providers/kit/process-host.test.ts apps/server/src/modules/chat-runtime-providers/codex`
>
> This plan was written from a dirty working tree. At planning time,
> `apps/server/src/modules/chat-runtime-providers/codex/config/runtime-config.ts`,
> generated Codex protocol/capability files, account diagnostics, and
> `apps/server/package.json` had unrelated in-progress edits. Preserve them and
> compare every Current state excerpt with the live file even when the commit
> drift command is empty.

## Status

- **Priority**: P0
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: `plans/041-enforce-domain-and-lifecycle-ownership.md` (DONE)
- **Category**: bug, performance, tech-debt, tests
- **Planned at**: commit `c450147`, 2026-07-14

## Why this matters

Codex app-server is a multi-thread process, but Cradle currently creates a host
scope per chat session and sometimes a separate process for diagnostics, quick
questions, and title generation. Releasing the final turn lease closes that
session's process immediately. A later maintenance request can therefore carry a
valid persisted `providerSessionId` into a fresh app-server process that has not
loaded the thread; the observed `thread/rollback` failure reports `thread not
found` even though the rollout exists on disk.

After this plan, one Codex provider target owns one warm app-server host under
normal operation. Chat sessions, side conversations, title threads, and other
ephemeral work are Codex threads multiplexed through that host. Thread routing,
loading, notification consumption, session environment, and skill-root updates
live behind one deep Codex host module, so callers cannot accidentally couple a
process lifetime to a turn or chat session.

## Current state

### Ownership is encoded at the wrong scope

- `apps/server/src/modules/chat-runtime-providers/codex/app-server/host-lease.ts:33-73`
  requires every caller to choose a `scopeId`, and the normal helper returns a
  chat-session scope:

  ```ts
  export function codexChatSessionAppServerScopeId(chatSessionId: string): string {
    return `chat-session:${chatSessionId}`
  }

  const lease = await acquireProviderProcessHostResource({
    runtimeKind: input.runtimeKind,
    providerTargetId: input.providerTargetId,
    scopeId: input.scopeId,
    // ...
  })
  ```

- `apps/server/src/modules/chat-runtime-providers/codex/provider.test.ts:1322-1420`
  explicitly asserts that concurrent chat sessions create two app-server clients
  and two session-scoped hosts. Replace this test; it enforces the architecture
  this plan removes.
- `apps/server/src/modules/chat-runtime-providers/codex/provider.ts:209-212`
  generates additional `ephemeral:*` process scopes. Account diagnostics use
  `provider-target-diagnostics:*` in
  `apps/server/src/modules/chat-runtime-providers/codex/app-server/account-diagnostics.ts:357-381`.

### Host retention does not retain an idle process

- `apps/server/src/modules/provider-runtime/host-manager.ts:141-153` destroys a
  host as soon as the final lease is released:

  ```ts
  entry.refCount = Math.max(0, entry.refCount - 1)
  // ...
  if (entry.refCount === 0) {
    this.removeHost(hostId, entry)
  }
  ```

  The advertised 30-minute TTL therefore never provides a warm idle resource.
  Existing pinned side-conversation semantics intentionally allow a pinned lease
  to expire unless refreshed; preserve that behavior while allowing an unleased
  resource to remain warm until `expiresAt`.

### Process environment currently forces session isolation

- `apps/server/src/modules/chat-runtime-providers/codex/app-server/client.ts:50-64`
  builds process environment containing `CRADLE_CHAT_SESSION_ID`, workspace, and
  agent values. `apps/server/src/modules/chat-runtime-providers/codex/README.md:7-9`
  then cites those values as the reason hosts cannot be provider-scoped.
- These values are session/thread context. Codex `ThreadStartParams`,
  `ThreadResumeParams`, and `TurnStartParams` already carry cwd and workspace
  roots; their generic thread config can carry Codex's native
  `shell_environment_policy.set` projection for Cradle's ambient CLI variables.
  Authentication tokens and model-provider connection settings remain process
  environment/configuration.

### Routing and loaded state are caller responsibilities

- `apps/server/src/modules/chat-runtime-providers/codex/app-server/host-resource.ts:57-67`
  falls back from a missing thread match to every handler without a thread id.
  That fallback is unsafe when unrelated sessions share one process.
- The same file starts the notification pump only while subscribers exist and
  broadcasts every message to every subscriber. A shared process needs one
  permanent drain and deterministic thread/global routing.
- `apps/server/src/modules/chat-runtime-providers/codex/provider.ts:864-887`
  calls `thread/rollback` directly with the durable id. In contrast,
  `turn/thread-lifecycle.ts:116-162` knows how to `thread/resume`, but only turn
  startup uses it. Host restart and thread load state are not hidden behind one
  interface.
- `skills/extraRoots/set` is process-global, yet
  `turn/thread-lifecycle.ts:70-85` overwrites it from each caller. Shared sessions
  would race unless the host owns a serialized provider-level union.

### Existing conventions to preserve

- `apps/server/src/modules/provider-runtime/README.md` assigns native protocol
  semantics to provider adapters and provider-neutral host lease accounting to
  Provider Runtime. Keep Codex routing/loading inside the Codex adapter; keep
  generic ref-count/TTL mechanics in Provider Runtime.
- `apps/server/AGENTS.md` requires lifecycle resources to be owned by the runtime
  resource registry, cross-domain writes to go through public owner functions,
  Drizzle for database access, and focused runtime tests before the full suite.
- `apps/server/src/modules/chat-runtime-providers/opencode/runtime-context.ts`
  is the local exemplar for a provider process that is pooled independently of
  sessions and remains warm for an idle TTL. Do not copy its SDK-specific
  implementation; match its ownership model.
- The current focused Codex/process-host baseline passes: 6 test files and 120
  tests passed on 2026-07-14 with the command below.

## Target architecture

```text
Provider target
└── CodexAppServerHost (one warm process, one notification pump)
    ├── durable thread A <-> chat session A
    ├── durable thread B <-> chat session B
    ├── ephemeral side/title/quick-question threads
    ├── host-level account/auth handlers
    └── provider-level union of skill extra roots
```

Create a deep Codex-owned module, named consistently with the existing
`app-server/host-*` files, with an interface equivalent to:

```ts
interface CodexProviderHostLease {
  hostId: string
  host: CodexProviderHost
  release(): void
}

interface CodexProviderHost {
  requestHost(method: string, params?: unknown): Promise<unknown>
  bindThread(input: CodexThreadBindingInput): Promise<CodexThreadHandle>
  ensureSkillExtraRoots(paths: string[]): Promise<void>
}

interface CodexThreadHandle {
  threadId: string
  request(method: string, params?: Record<string, unknown>): Promise<unknown>
  subscribe(subscriber: CodexThreadSubscriber): () => void
  registerServerRequestHandler(handler: CodexThreadRequestHandler): () => void
}
```

Exact type names may match local conventions, but these invariants are fixed:

1. Callers choose a provider target, never a process `scopeId`.
2. `bindThread` starts a missing thread or resumes an existing thread once per
   host resource generation. It is idempotent for concurrent bind calls.
3. A thread handle injects/validates its own `threadId`; ordinary callers do not
   manually coordinate loaded state.
4. One permanent host pump drains app-server notifications and routes them by
   protocol `threadId`. Host-level notifications have a distinct subscription.
5. Server requests with a `threadId` go only to that thread's active handler.
   Missing routes fail closed with a stable error/denial. They are never
   broadcast to another session.
6. Active-operation leases affect ref counts. Releasing a turn does not dispose
   the host; idle TTL, explicit invalidation, crash, or server shutdown does.
7. A pinned side-thread lease may retain the same provider host without claiming
   exclusive ownership. Existing side-conversation TTL semantics remain valid.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused baseline | `pnpm --filter @cradle/server exec vitest run src/modules/chat-runtime-providers/kit/process-host.test.ts src/modules/chat-runtime-providers/codex/app-server/client.test.ts src/modules/chat-runtime-providers/codex/app-server/host-fingerprint.test.ts src/modules/chat-runtime-providers/codex/app-server/bridge.test.ts src/modules/chat-runtime-providers/codex/provider.test.ts src/modules/chat-runtime-providers/codex/app-server/account-diagnostics.test.ts --maxWorkers=1` | all matching tests pass |
| All Codex tests | `pnpm --filter @cradle/server exec vitest run src/modules/chat-runtime-providers/codex --maxWorkers=1` | all pass |
| Provider lifecycle tests | `pnpm --filter @cradle/server exec vitest run src/modules/provider-runtime src/modules/provider-targets src/modules/chat-runtime-providers/kit/process-host.test.ts --maxWorkers=1` | all pass |
| Server typecheck/boundaries | `pnpm --filter @cradle/server typecheck` | exit 0, including boundary check |
| Scoped lint | `pnpm exec eslint apps/server/src/modules/provider-runtime apps/server/src/modules/provider-targets apps/server/src/modules/chat-runtime-providers/kit/process-host.ts apps/server/src/modules/chat-runtime-providers/kit/process-host.test.ts apps/server/src/modules/chat-runtime-providers/codex` | exit 0 |
| Full server tests | `pnpm --filter @cradle/server test` | all pass, or unrelated pre-existing failures documented with exact evidence |
| Diff hygiene | `git diff --check` | no output |

## Suggested executor toolkit

- Use `cradle-chat-runtime-sdk-update` if available when interpreting generated
  Codex app-server protocol semantics. Do not regenerate or hand-edit protocol
  bindings for this plan.
- Use `codebase-design` if available to keep raw client, routing maps, loaded
  state, and synchronization behind the Codex host module's interface.

## Scope

**In scope**:

- `apps/server/src/modules/provider-runtime/host-manager.ts`
- `apps/server/src/modules/provider-runtime/host-manager.test.ts` (create)
- `apps/server/src/modules/provider-runtime/service.ts`
- `apps/server/src/modules/provider-runtime/README.md`
- `apps/server/src/modules/provider-targets/service.ts`
- `apps/server/src/modules/provider-targets/service.test.ts`
- `apps/server/src/modules/chat-runtime-providers/kit/process-host.ts`
- `apps/server/src/modules/chat-runtime-providers/kit/process-host.test.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/host-lease.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/host-resource.ts`
- focused new `host-resource.test.ts` or `host-lease.test.ts` beside those files
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/host-fingerprint.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/host-fingerprint.test.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/client.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/client.test.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/env.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/bridge.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/bridge.test.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/account-diagnostics.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/app-server/account-diagnostics.test.ts`
- one new Codex-owned provider-host/thread-handle module and focused test under
  `apps/server/src/modules/chat-runtime-providers/codex/app-server/`
- `apps/server/src/modules/chat-runtime-providers/codex/config/runtime-config.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/config/runtime-config.test.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/turn/thread-lifecycle.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/turn/active-turn-registry.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/types.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/provider.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/provider.test.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/README.md`
- `plans/README.md` status update only

**Out of scope**:

- Generated files under `codex/app-server-protocol/` and generated capability
  manifests. The current 0.144.4 generation is input data, not an edit target.
- OpenCode or Claude Agent host architecture.
- Chat Runtime transcript/event schemas, database schema, migrations, and web UI.
- Replacing deprecated `thread/rollback` with a new conversation-edit protocol;
  this plan only makes the existing operation run against a bound thread.
- A compatibility switch that keeps both session-scoped and provider-scoped
  Codex hosts.
- A remote execution server for `TurnEnvironmentParams` unless the per-thread
  native environment projection fails the explicit STOP condition below.

## Git workflow

- Branch: `advisor/052-own-codex-app-server-host`
- Suggested logical commits:
  1. `test(codex): characterize provider host multiplexing`
  2. `refactor(provider-runtime): retain idle process hosts`
  3. `refactor(codex): own app-server host per provider`
  4. `test(codex): verify thread routing and restart recovery`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add failing ownership and isolation characterization

Before changing production code, replace the test that expects two clients for
two concurrent chat sessions with the target expectation: the same provider
target creates one client, initializes once, and serves two distinct thread ids.
Add tests for all of these observable cases:

- two simultaneous normal turns on different chat sessions share one host;
- notifications for thread A never reach thread B's subscriber;
- an approval/server request for thread A invokes only A's handler;
- an unknown thread request fails closed and never falls back to B or a generic
  session handler;
- releasing A's turn keeps the process alive while B is active and after both
  become idle;
- diagnostics and a chat turn for the same target share the host/account state;
- different provider target ids never share a host;
- process-level fingerprint changes do not silently reuse incompatible auth or
  model-provider configuration.

Use fake clients and deferred promises; do not use sleeps. Confirm the new
provider-sharing tests fail against the current implementation for the expected
session-scope/client-count reason.

**Verify**: focused Vitest output shows only the newly added target-behavior tests
failing, with existing tests still passing.

### Step 2: Make Provider Runtime retain zero-reference resources until TTL

Change `ProviderRuntimeHostManager.releaseLease` so zero references mark an entry
idle but do not immediately remove it. `reapIdleHosts` disposes an idle resource
only after `expiresAt`; active non-pinned leases continue to block reaping, and
the existing pinned lease rule continues to allow an unrefreshed live-only side
conversation to expire. Reacquiring before expiry must cancel idle disposal by
refreshing the deadline and return the exact same resource.

Add fake-clock tests for:

- release to zero retains the resource;
- reacquire before TTL returns the same resource and factory runs once;
- expiry disposes once;
- explicit invalidation and shutdown dispose once;
- a pinned lease still expires according to its refreshable TTL;
- resource factory rejection leaves a reusable clean entry;
- incompatible fingerprint behavior remains explicit and tested.

Add a provider-target invalidation operation owned by Provider Runtime that can
remove every host generation for a target. Call it from Provider Targets after
connection config, credential, provider kind, or enabled state changes, and on
target removal. Cosmetic label/icon/model-visibility changes must not restart the
process. Reuse the existing Provider Targets -> Provider Runtime public call
direction; do not import Codex internals into Provider Targets.

**Verify**: provider-runtime/process-host/provider-target tests pass under fake
timers and assert exact factory/disposer call counts.

### Step 3: Introduce the provider-owned Codex host module

Replace caller-selected Codex `scopeId` with one stable provider-target host
scope. The host module must own the raw `CodexAppServerClientLike`, initialization
and ChatGPT authentication promise, process fingerprint, loaded-thread set,
in-flight thread binds, request routes, notification routes, and skill-root
synchronization. Do not expose the raw client to ordinary provider operations.

Start one notification pump during host initialization and keep it running until
resource disposal. Route messages containing `params.threadId` to that thread's
subscribers. Route documented account/global notifications separately. Drop
messages with no consumer only after they have been drained; never leave them in
the client's queue for a later unrelated turn.

Replace handler fallback with exact routing. Host-global server request handling
is permitted only for explicitly enumerated auth/account methods that do not
belong to a thread. A thread-scoped request without a registered route must return
the provider's safe decline/cancel response when one exists, otherwise throw a
stable routing error and record diagnostics. Do not guess a session from the most
recent lease.

Serialize `skills/extraRoots/set` in the host. Maintain a monotonic union of
Cradle-resolved roots seen by this provider-host generation and send the full
union only when it changes. Cache the native unknown-method result for that host
generation. Do not let concurrent sessions overwrite one another's roots.

**Verify**: new host-resource tests pass for permanent pumping, exact thread
routing, global routing, concurrent bind deduplication, skill-root union, and
single cleanup/disposal.

### Step 4: Move session context from process env to thread config

Split current environment projection into:

- process environment: authentication and process compatibility only;
- thread environment: `CRADLE_CHAT_SESSION_ID`, `CRADLE_WORKSPACE_ID`,
  `CRADLE_WORKSPACE_PATH`, `CRADLE_AGENT_ID`, and `CRADLE_AGENT_HOME` projected
  through Codex's native per-thread `shell_environment_policy.set` config.

Thread start, resume, fork, quick-question, title, and shell-command paths must
receive the correct thread context. Do not mutate `process.env`, and do not put
session values into the host fingerprint. Preserve cwd, runtime workspace roots,
sandbox, approval, system instructions, MCP config, and auth behavior.

Add config projector tests proving two sessions produce different thread env
sets while their process options have no session/workspace/agent values. Add one
vendored-runtime integration test or deterministic protocol harness that creates
two threads on one app-server and executes a shell environment read in each;
each result must contain only its own Cradle context.

**Verify**:

```bash
rg -n "CRADLE_CHAT_SESSION_ID|CRADLE_WORKSPACE_ID|CRADLE_WORKSPACE_PATH|CRADLE_AGENT_ID|CRADLE_AGENT_HOME" \
  apps/server/src/modules/chat-runtime-providers/codex/app-server/client.ts \
  apps/server/src/modules/chat-runtime-providers/codex/app-server/env.ts
```

returns no process-env projection, while runtime-config tests prove all five
values are present in the intended thread config.

### Step 5: Bind every existing thread once per host generation

Make `bindThread` the only entry for session-scoped Codex operations. For a
runtime session without `providerSessionId`, it calls `thread/start`, records the
returned id, and marks it loaded. For an existing id, it calls `thread/resume`
with the current thread context and `excludeTurns: true` once per host generation.
Concurrent binds for the same id await one promise. A failed bind clears its
in-flight/cache entry so retry can succeed.

Return a thread handle that injects its id into requests and scopes subscriptions
and server-request handlers. Do not classify methods with string-prefix
heuristics. Host methods and thread methods must be selected from the generated
capability metadata or explicit typed entry points.

Add the regression test from the reported failure:

1. create and persist a Codex thread;
2. stop/release its turn;
3. dispose or invalidate the host to simulate restart;
4. reacquire the provider host;
5. request rollback through the provider;
6. assert `thread/resume` occurs before `thread/rollback` and the rollback
   succeeds against the same thread id.

Also test resume failure, simultaneous UI-slot/rollback binds, and host generation
replacement. Do not special-case `thread not found` as success.

**Verify**: focused provider test records exactly one resume per existing thread
per host generation and passes the stop/restart/rollback regression.

### Step 6: Migrate all Codex call sites and delete scope variants

Migrate these callers to the provider host/thread handle interface:

- normal stream turns, cancellation, steering, settings, and shell commands;
- rollback and all UI-slot/background-terminal/provider-thread reads;
- provider-native bridge invoke and SSE stream;
- account diagnostics and rate-limit credit consumption;
- forked side threads and their pinned retention lease;
- quick questions and title generation.

Quick-question/title/fork isolation comes from ephemeral Codex threads and exact
notification routing, not a second process. Account diagnostics use host-level
requests on the same provider target host. Preserve the existing live-only side
conversation policy: a side conversation may hold a pinned lease on the shared
provider host, but releasing it must not close a host used by other sessions.

Delete `codexChatSessionAppServerScopeId`, diagnostics scope helpers, ephemeral
process-scope generation, direct `resource.client` access from migrated callers,
and duplicated skill synchronization. Do not retain forwarding aliases.

Handle auth mutations explicitly: successful logout or credential replacement
invalidates the provider host so the next acquire initializes from authoritative
credentials. Login/token refresh updates the host-owned authentication state and
secret callback without registering per-session global handlers.

**Verify**:

```bash
rg -n "chat-session:|provider-target-diagnostics:|codexEphemeralAppServerScopeId|resource\.client" \
  apps/server/src/modules/chat-runtime-providers/codex \
  --glob '!**/*.test.ts'
```

returns no obsolete process scopes or raw-client access outside the new host
module and low-level client implementation.

### Step 7: Ratchet concurrency, lifecycle, and documentation

Update Codex and Provider Runtime READMEs with the final ownership table:

- provider target owns process/auth/account/global skill roots;
- thread owns cwd/workspace roots/model/sandbox/instructions/session environment;
- Chat Runtime owns transcript/run/session rows;
- active operation owns only routing subscriptions and a temporary lease.

Add tests covering 2+ concurrent sessions, one cancelled while another streams,
one side thread released while a normal thread remains active, idle reuse, TTL
expiry, process crash/recreation, provider-target invalidation, and server
shutdown. Assert no event, approval, environment, model/thread setting, or
cleanup crosses thread ids.

Run the full verification table. If the repository-wide server suite is blocked
by unrelated dirty work, record the exact failing files/tests in the plan status;
the focused Codex, Provider Runtime, Provider Targets, typecheck, boundary, lint,
and diff gates are mandatory.

**Verify**: all mandatory gates exit 0 and `providerRuntimeHostManager.listHosts()`
shows one normal Codex host for each active/warm provider target, never one per
chat session.

## Test plan

- **Host lifecycle**: zero-ref warm retention, reuse, TTL expiry, explicit target
  invalidation, shutdown, failed creation, incompatible fingerprint.
- **Multiplexing**: two simultaneous sessions share one initialized client and
  maintain different thread ids/settings.
- **Routing**: thread notification, approval request, cancellation, completion,
  and error isolation; global account notification delivery; unknown route fails
  closed.
- **Loaded state**: new thread, existing thread, concurrent bind dedupe, failed
  resume retry, host restart, rollback after immediate stop.
- **Environment**: no session context in process env; five Cradle ambient values
  isolated per thread and visible to that thread's shell commands.
- **Global host state**: serialized skill-root union and auth refresh/login/logout.
- **Ephemeral work**: side, quick-question, and title threads share the provider
  host without consuming one another's notifications.
- **Target lifecycle**: config/credential/provider-kind/disable/delete invalidates
  the correct target only; cosmetic edits do not.
- Follow existing fake-client patterns in `provider.test.ts` and `bridge.test.ts`.
  Prefer focused module tests for host routing so `provider.test.ts` does not grow
  another internal implementation harness.

## Done criteria

- [ ] Concurrent chat sessions using one provider target share one app-server
  process and keep distinct Codex threads.
- [ ] Different provider targets never share process/auth/account state.
- [ ] Releasing a turn does not close the host; zero-ref hosts remain warm until
  TTL or explicit invalidation.
- [ ] No Cradle chat/workspace/agent context is stored in app-server process env.
- [ ] Shell/tool subprocesses receive the correct per-thread Cradle context.
- [ ] One permanent notification pump routes by thread id with no broadcast
  fallback or stale queued notifications.
- [ ] Thread server requests fail closed when no exact route exists.
- [ ] Existing durable threads resume once per host generation before maintenance
  operations; immediate-stop rollback passes.
- [ ] Diagnostics, title, quick-question, side, and normal turns use the same
  provider host under normal operation.
- [ ] Process-global skill roots update as a serialized union.
- [ ] Provider config/credential/disable/delete lifecycle invalidates only the
  affected provider target host.
- [ ] Session-scoped and diagnostics/ephemeral Codex process scope helpers are
  deleted without compatibility aliases.
- [ ] Focused tests, typecheck/boundaries, scoped lint, and diff hygiene pass.
- [ ] Codex and Provider Runtime ownership docs and `plans/README.md` are updated.

## STOP conditions

- The bundled Codex runtime does not support per-thread shell environment
  projection through `shell_environment_policy.set`, or a two-thread integration
  test shows environment leakage. Stop and report the protocol limitation; do
  not restore session-scoped process hosts or invent an environment heuristic.
- A Codex server request used by approvals lacks a thread id or another stable
  protocol correlation key. Stop with the exact method/payload shape; do not
  route it to the latest/only session.
- A process-global Codex setting other than account/auth and skill roots is
  currently mutated per session and cannot be projected at thread/turn scope.
  Stop and enumerate it before sharing the host.
- Provider-target connection changes must preserve active turns without
  interruption, but the current host manager cannot drain one generation while
  admitting another. Stop and split a reviewed generational-host migration;
  do not silently use stale credentials or kill unrelated target hosts.
- Correct side-thread retention requires making ephemeral Codex threads durable.
  Preserve live-only behavior and report the lifecycle conflict instead.
- Generated protocol changes appear necessary. Stop and run the separate SDK
  update workflow rather than editing generated files by hand.
- Any mandatory verification fails twice for the same reason, or an in-scope
  excerpt no longer matches the live ownership model.

## Maintenance notes

- The provider target is the process compatibility/lifecycle owner. New
  session-scoped behavior belongs in thread start/resume/turn params, never the
  process fingerprint or environment.
- Every new thread-scoped notification or server request must add an isolation
  test with two concurrent thread ids.
- Every new process-global mutable method must define serialization and ownership
  in the Codex host module before callers use it.
- Host restart is expected, not exceptional. Durable thread operations must
  continue to pass through `bindThread`; never cache loaded state outside the
  host resource generation.
- Reviewers should reject raw app-server client access that escapes the host
  module, new caller-selected scope ids, or fallback routing based on recency.
