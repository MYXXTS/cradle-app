# Plan 057：让 OpenCode Runtime 内置可发现、按需安装且由 Cradle 管理

> **Executor instructions**: Follow this plan milestone by milestone. Run every
> verification command and confirm the expected result before moving to the
> next milestone. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise, add a compatibility shim, or broaden Download
> Center into an installer. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer explicitly owns the index.
>
> **Drift check (run first)**:
> `git diff --stat 3dca102..HEAD -- apps/server/package.json apps/server/scripts apps/server/src/app.ts apps/server/src/modules/download-center apps/server/src/modules/managed-resources apps/server/src/modules/opencode-server apps/server/src/modules/chat-runtime-providers/opencode apps/server/specs/capabilities/chat-runtime.md apps/server/tests apps/web/src/features/managed-resources apps/web/src/locales packages/download-center pnpm-lock.yaml plans/README.md`
> If an in-scope file changed, compare the "Current state" excerpts against the
> live code before proceeding; semantic drift in Download Center ownership,
> OpenCode process pooling, OpenCode SDK version, Server composition, or Managed
> Resources routing is a STOP condition. Also run
> `git status --short -- apps/server/src/app.ts apps/server/src/modules/managed-resources apps/server/src/modules/chat-runtime-providers/opencode apps/server/src/modules/opencode-server apps/web/src/features/managed-resources apps/web/src/locales`.
> At planning time several of these paths had unrelated uncommitted work. Do not
> execute this plan in an overlapping dirty worktree; start from a clean worktree
> after the operator has committed or otherwise reconciled those changes.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/056-declare-managed-resources.md` and `plans/047-build-unified-download-center.md` (the Download Center implementation landed in commit `3fad235`; reconcile the stale Plan 047 TODO index row before execution)
- **Category**: direction, security, migration, dx
- **Planned at**: commit `3dca102`, 2026-07-15
- **Executed**: DONE on 2026-07-16

Execution note: the SDK-aligned eight-target manifest, shared resolver and
redacted health probe, secure two-pass archive validation, immutable staged
installation, atomic pointer, exact Download Center identity, optional catalog
adapter, managed-only auto-update suppression, side-by-side leases, uninstall
gating, and shutdown draining are implemented. Manifest sync, focused OpenCode,
catalog, Download Center, Chronicle, and generic Web tests pass together with
the typecheck/boundary/build/lint/diff gates. Repository-wide i18n CI remains
blocked by pre-existing unrelated locale debt (251 missing keys, two plural
entries, and 15 hardcoded-text findings); the OpenCode UI uses the generic
`resources`/`chrome` namespaces, which have zero missing, extra, or invalid
entries.

## Why this matters

Cradle already ships the OpenCode Chat Runtime adapter and
`@opencode-ai/sdk@1.17.11`, but it does not ship or manage the `opencode`
executable. The provider is always selectable and only discovers the missing
binary when model discovery or session startup tries to spawn `opencode serve`,
so users need an undocumented global installation and can silently run a CLI
version different from the SDK version Cradle compiled against.

After this plan, the OpenCode adapter and SDK remain built in while the native
CLI is an explicit optional resource. A user can inspect the active source,
install the Cradle-compatible CLI from the unified Resources page, watch/cancel
the transfer through Download Center, retry a failed transfer through the
declared resource, and
uninstall only Cradle-owned copies. Existing operator overrides and PATH
installations remain readable external namespaces; Cradle never upgrades or
deletes them.

The design keeps the existing ownership seam deep:

- OpenCode owns release identity, target selection, archive extraction,
  executable verification, version switching, uninstall, process leases, and
  the active executable decision.
- Server Download Center owns HTTPS byte transfer, checksum/size verification,
  cancellation, resumable retry, redacted task history, and progress events.
- Chat Runtime continues to own runtime selection and session semantics. This
  plan does not add a generic runtime installer interface to `ChatRuntime` for a
  single implementation.
- Managed Resources owns the generic Web projection and exact Download Center
  join. Web never receives a URL, request header, archive path, executable path,
  or staging path.

## Current state

### Repository and verification conventions

- This is a pnpm 11 TypeScript monorepo. Server uses Elysia, Drizzle, Vitest,
  and the module layout documented in `apps/server/AGENTS.md`.
- Server business modules normally split HTTP shape, schema, and semantics into
  `index.ts`, `model.ts`, `service.ts`, plus a README. Expected errors use
  `AppError`; routes do not invent a second error envelope.
- `apps/server/src/app.ts` is the composition root. Long-running resources are
  registered with `RuntimeResourceRegistry`; business logic does not belong in
  `app.ts`.
- Web feature code uses generated API clients, React Query, static Tailwind
  classes, and `cn()` for class composition. Reuse Plan 056's resource rows and
  actions; do not build an OpenCode-only visual system.
- New Elysia routes with `x-cradle-cli` metadata are followed by
  `pnpm generate:web` and `pnpm gen:cli`; generated files are not hand-edited.
- Do not add a database table. Download task history already exists, while the
  OpenCode installation truth is a small OpenCode-owned manifest on disk.

### OpenCode is built in, but its executable is external and unchecked

`apps/server/package.json` currently declares:

```json
"@opencode-ai/sdk": "^1.17.11"
```

The lockfile and installed package resolve SDK `1.17.11`. OpenCode upstream tag
`v1.17.11` publishes matching CLI archives for Darwin, Linux (glibc and musl),
and Windows, including baseline x64 builds. GitHub release asset metadata
contains both the byte size and a `sha256:<hex>` digest. The release metadata is
available at:

```text
https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.11
```

Do not install `latest`. The checked-in compatibility manifest must match the
actually installed SDK package version. Future SDK upgrades must refresh and
review the runtime manifest in the same change.

`apps/server/src/modules/chat-runtime-providers/opencode/runtime-context.ts:279-290`
currently resolves only an operator override or a command name:

```ts
export function resolveOpencodeBinaryPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.CRADLE_OPENCODE_PATH?.trim() || 'opencode'
}

export function resolveOpencodeRuntimeHostOptions(input: {
  binaryPath?: string
  directory?: string
} = {}): { binaryPath: string, cwd: string } {
  return {
    binaryPath: input.binaryPath?.trim() || resolveOpencodeBinaryPath(),
    cwd: input.directory?.trim() || process.cwd(),
  }
}
```

There is no PATH existence check, version probe, managed path, or stable
not-installed error. `apps/server/src/modules/chat-runtime-providers/opencode/runtime-context.test.ts:23-61`
characterizes the current override and fallback behavior; update this test
rather than deleting it.

`apps/server/src/modules/chat-runtime-providers/opencode/runtime-context.ts:84-229`
already provides the important lifecycle primitive: `OpencodeRuntimePool`
pools by `binaryPath + cwd`, reference-counts leases, and keeps an idle host warm
before stopping it. Side-by-side versions therefore fit the current model: a
running session retains the old absolute binary path while new acquisitions can
resolve a newly activated version.

`apps/server/src/modules/chat-runtime-providers/opencode/provider.ts:374-426`
acquires the process lazily during session start/resume without passing an
explicit path:

```ts
const lease = await acquireOpencodeRuntimeResource({
  runtimeKind: this.runtimeKind,
  providerTargetId: resolved.hostProviderTargetId,
  chatSessionId: input.chatSessionId,
  config: resolved.config,
  directory: input.workspacePath,
})
```

`apps/server/src/modules/chat-runtime-providers/opencode/model-inventory.ts:199-215`
also resolves the same host options before running SDK and CLI discovery in
parallel. The managed resolver must be shared by both paths; do not patch only
session startup.

OpenCode provider metadata is always registered and marks the provider binding
as runtime-owned (`metadata.ts:14-27`). This plan preserves that: the adapter is
built in even when no executable is installed.

### OpenCode auto-upgrade must not own a Cradle-managed binary

OpenCode `v1.17.11` supports `OPENCODE_DISABLE_AUTOUPDATE=1`. Its SDK also
exposes a global upgrade operation that delegates to curl/npm/pnpm/brew/etc.
Neither mechanism is an acceptable Cradle installation path because it bypasses
Download Center, the pinned checksum, atomic promotion, rollback, and task
history. Only processes launched from a Cradle-managed binary must receive
`OPENCODE_DISABLE_AUTOUPDATE=1`; operator-configured and PATH binaries continue
to inherit the user's native OpenCode configuration and lifecycle.

The existing README decision in
`apps/server/src/modules/chat-runtime-providers/opencode/README.md:7-9` remains
binding: OpenCode processes inherit the user's native config, auth, and project
scope. Do not set `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG_DIR`,
`OPENCODE_DB`, or `OPENCODE_DISABLE_PROJECT_CONFIG` as part of installation.

### Download Center is already the byte-transfer seam

`apps/server/src/modules/download-center/README.md:11-21` states that
`execute`, `retry`, and `release` are trusted host-internal capabilities. Public
routes can only list, read, cancel, or subscribe to redacted tasks; they never
accept a URL or return a filesystem path.

`packages/download-center/src/contract.ts:32-46` defines the internal request
and artifact handoff:

```ts
export interface DownloadRequest {
  owner: DownloadOwner
  fileName: string
  sources: readonly DownloadSource[]
  integrity?: DownloadIntegrity
  maxBytes: number
  maxAttempts?: number
}

export interface DownloadedArtifact {
  taskId: string
  filePath: string
  bytes: number
  checksum: DownloadChecksumResult
}
```

Use the Chronicle owner pattern at
`apps/server/src/modules/chronicle/service.ts:8377-8431`: build a stable owner
and source identity, find the latest retryable task, call `retry` or `execute`,
copy/extract from the host-only artifact path, and call `release` after promotion
or failure cleanup. Do not add a public enqueue route.

The OpenCode request identity must be:

```text
owner.namespace     = opencode
owner.resourceType  = runtime
owner.resourceId    = cli
source.id            = github:anomalyco/opencode:<tag>:<asset-name>
```

The request must use the checked-in expected byte count and SHA-256 digest, and
`maxBytes` must equal the checked-in expected archive size (never an unbounded
generic archive limit).

### Managed Resources is the declaration and command surface

Plan 056 establishes `apps/server/src/modules/managed-resources/` and the
`/managed-resources` list/get/install/update/uninstall contract. OpenCode must
register one adapter and declare its optional CLI before any transfer begins.
Do not add parallel OpenCode installation routes or another primary Settings
surface. The existing shallow `GET /opencode/server/resources` route remains a
provider process diagnostic; preserve its URL and generated CLI command.

`apps/server/src/app.ts:114-125,202-220,234-305` already constructs and boots
Download Center, injects it into trusted owners, registers its routes, and owns
shutdown. Plan 056 also composes one Managed Resource registry. Compose the
OpenCode installation service here and register its adapter into that existing
registry; do not create a module-global downloader or second registry.

`apps/web/src/features/managed-resources/` owns the Resources/Transfers page and
exact resource-task join. Once the adapter appears in the catalog projection,
the generic row/actions must render it without OpenCode-only query or mutation
UI. Only a small trusted kind icon/label mapping is permitted; no OpenCode
lifecycle logic belongs in Web.

## Target interface and state

### On-disk ownership

All managed files live below the Server data namespace:

```text
<CRADLE_DATA_DIR>/runtimes/opencode/
  current.json
  versions/
    1.17.11/
      bin/opencode          # opencode.exe on Windows
      installation.json
  staging/
    <operation-id>/...
```

If Server configuration derives its data root from `CRADLE_DB_PATH`, use the
same `getServerConfig().dataDir ?? dirname(getServerConfig().dbPath)` convention
as Download Center. Never write into `~/.opencode`, a global package-manager
directory, the Desktop app bundle, the repository, or the user's PATH.

`current.json` is the atomic active-version pointer and contains only
non-sensitive data: schema version, OpenCode version, release tag, resolved
target, relative executable path, archive checksum, installed timestamp. Do
not persist the source URL or an absolute executable path. Write to a sibling
temporary file, fsync/close it, then rename it over `current.json`.

Version directories are immutable after promotion. An update installs a new
version beside the old version and atomically switches `current.json`. Do not
overwrite a running executable, especially on Windows. Old versions may remain
until the next Server boot; `boot()` may delete non-current version directories
because no OpenCode host leases exist yet. Do not delete an old version during
the same process lifetime unless the pool proves that exact binary path has no
lease or pending startup.

### Executable precedence

Resolve one structured launch descriptor, not just a string:

```ts
type OpencodeExecutableSource = 'configured' | 'managed' | 'path'

interface ResolvedOpencodeExecutable {
  source: OpencodeExecutableSource
  command: string
  version: string | null
  managed: boolean
}
```

Resolution order is fixed:

1. A non-empty `CRADLE_OPENCODE_PATH` operator override. Probe it but never
   replace, upgrade, or remove it.
2. A valid Cradle `current.json` whose relative path stays inside the managed
   OpenCode root, whose file exists, and whose installation manifest matches.
3. An executable discovered explicitly on PATH (`opencode.exe` on Windows,
   `opencode` elsewhere). Resolve it to an absolute path; do not return a command
   name that may fail later.
4. Missing. Return/throw the stable owner error
   `opencode_runtime_not_installed` before spawning or model discovery.

Do not infer compatibility for external versions. Report the probed version and
source as operator-owned; only the managed executable claims alignment with the
checked-in SDK/runtime manifest.

### Managed Resource projection

Project OpenCode-owned state through Plan 056's redacted descriptor:

```ts
const descriptor = {
  key: { namespace: 'opencode', resourceType: 'runtime', resourceId: 'cli' },
  displayName: 'OpenCode CLI',
  kind: 'runtime',
  required: false,
  // state/source/version/size/action fields come from the owner service
}
```

No absolute path, archive path, URL, checksum, headers, source details, or raw
spawn error may cross the descriptor. A configured override projects the active
external version and disables managed install because a lower-precedence copy
would not change the runtime. A PATH runtime projects as externally installed;
install may remain available as an explicit migration to the managed target.
Uninstall is available only for Cradle-owned managed files and never removes an
override/PATH binary. Update is available only when a managed installed version
differs from the checked-in compatible target. A failed transfer remains a
Download Center task; owner installation truth determines descriptor state.

The archive DownloadRequest uses the exact descriptor identity plus its trusted
display name. Plan 056's authenticated generic routes and CLI commands dispatch
install/update/uninstall without a body. Do not add `/opencode/runtime/*`
commands or accept arbitrary version/release/tag/asset/URL/checksum/path input.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Verify manifest is synchronized | `pnpm --filter @cradle/server sync:opencode-runtime-manifest -- --check` | exit 0; checked-in SDK version, release assets, sizes, and digests match upstream `v<SDK version>` metadata |
| Catalog dependency check | `pnpm --filter @cradle/server exec vitest run src/modules/managed-resources/service.test.ts tests/managed-resources.test.ts` | Plan 056 catalog contract and dispatch remain green with the OpenCode adapter |
| Server focused tests | `pnpm --filter @cradle/server exec vitest run src/modules/chat-runtime-providers/opencode/runtime-release.test.ts src/modules/chat-runtime-providers/opencode/runtime-installation.test.ts src/modules/chat-runtime-providers/opencode/runtime-context.test.ts src/modules/chat-runtime-providers/opencode/managed-resource-adapter.test.ts tests/managed-resources.test.ts tests/download-center.test.ts` | all selected tests pass; no real network or real OpenCode process is required |
| Existing OpenCode provider tests | `pnpm --filter @cradle/server exec vitest run src/modules/chat-runtime-providers/opencode/provider.test.ts src/modules/chat-runtime-providers/opencode/model-inventory.test.ts` | all pass |
| Web focused tests | `pnpm --filter @cradle/web exec vitest run --config vite.config.ts --environment jsdom src/features/managed-resources/managed-resources-page.test.tsx src/features/managed-resources/projection.test.ts` | the generic page renders and dispatches the OpenCode descriptor without an owner-specific screen |
| Server typecheck/boundaries | `pnpm --filter @cradle/server typecheck` | exit 0, including `check:boundaries` |
| Web typecheck/API boundary | `pnpm --filter @cradle/web typecheck` | exit 0 |
| CLI typecheck | `pnpm --filter @cradle/cli typecheck` | exit 0; existing generic managed-resource commands accept the OpenCode key |
| i18n validation | `pnpm --filter @cradle/web i18n:ci` | exit 0; any generic label additions are complete |
| Scoped lint | `pnpm exec eslint apps/server/scripts/sync-opencode-runtime-manifest.mjs apps/server/src/app.ts apps/server/src/modules/chat-runtime-providers/opencode apps/web/src/features/managed-resources` | exit 0 for plan-owned source files |
| Diff hygiene | `git diff --check` | no output, exit 0 |

Do not run a real install against the user's data directory as verification.
Tests must inject a temporary root, fake downloader, fake archive extractor, and
fake version probe. A manual smoke install is optional only with explicit
operator approval and an isolated `CRADLE_DATA_DIR`.

## Suggested executor toolkit

- Use `server-app-development` for lifecycle composition, AppError mapping,
  module documentation, and integration with the existing catalog contract.
- Use `codebase-design` to keep the OpenCode installer a deep module and avoid a
  generic runtime-manager interface with only one adapter.
- Use `vercel-react-best-practices` only if the generic Resources page requires
  a small projection adjustment; keep OpenCode state on the Server adapter.

## Scope

### In scope

- `apps/server/package.json` — add the manifest sync/check command only; do not
  change the OpenCode SDK version in this plan.
- `apps/server/scripts/sync-opencode-runtime-manifest.mjs` (new).
- `apps/server/src/app.ts` — compose/boot/shutdown the injected OpenCode runtime
  installation owner and register its adapter in Plan 056's registry.
- `apps/server/src/modules/chat-runtime-providers/opencode/`:
  - checked-in release manifest;
  - release/target resolver and tests;
  - installation/status service and tests;
  - Managed Resource adapter and tests;
  - runtime-context resolver/pool integration and tests;
  - provider health/preflight integration where needed;
  - README updates.
- Minimal documentation update around the existing
  `apps/server/src/modules/opencode-server/index.ts` diagnostic route if needed;
  do not move catalog commands into this module.
- `apps/server/specs/capabilities/chat-runtime.md` — document the built-in
  adapter/optional managed runtime distinction and stable preflight behavior.
- Extend Plan 056 catalog HTTP tests with the OpenCode adapter/key and redaction.
- Minimal generic Resources-page presentation/i18n changes only if the existing
  `runtime` kind cannot render the descriptor without owner-specific logic.
- `plans/README.md` status/dependency notes.

### Out of scope

- Updating `@opencode-ai/sdk` beyond `1.17.11`; do that in a separate SDK/runtime
  compatibility change after this mechanism exists.
- Bundling an OpenCode binary into Electron, Server build artifacts, asar, or
  packaged resources.
- Using Desktop Download Center or adding Desktop IPC. The executable is
  consumed by Server and must work for standalone/remote Server deployments.
- Adding a generic `runtime-installer`, a new hook to `ChatRuntime`, or a runtime
  installation database table.
- Calling OpenCode `/global/upgrade`, `opencode upgrade`, curl-to-shell install,
  npm/pnpm global install, Homebrew, Scoop, or Chocolatey.
- Automatically installing on boot, runtime selection, model discovery, or
  first message. Installation requires an explicit authenticated command.
- Automatically updating to GitHub `latest`, periodically polling for updates,
  or adding update channels.
- Writing or migrating user OpenCode config/auth/project state. Preserve native
  config ownership.
- Deleting or modifying `CRADLE_OPENCODE_PATH` or PATH installations.
- Redesigning the Plan 056 Resources page or adding a Settings owner surface.
- New OpenCode-specific HTTP/CLI command routes or generated clients; use the
  existing managed-resource key commands.
- Browser E2E tests, a database migration, Download Center schema changes, task
  batching, archive caches, or cross-version deduplication.

## Git workflow

- Branch/worktree: `advisor/057-manage-optional-opencode-runtime` from a clean
  base after the operator's current overlapping work is committed/reconciled.
- Use conventional commits matching repository history, for example:
  - `feat(opencode): add managed runtime manifest`
  - `feat(opencode): install runtime through download center`
  - `feat(resources): declare optional opencode runtime`
- Do not push, open a PR, merge, or modify the operator's dirty branch unless
  explicitly instructed.

## Milestones

### Milestone 0: Characterize the current resolver and ownership boundaries

Before implementation, extend tests without changing production behavior:

1. In `runtime-context.test.ts`, retain the existing configured-path and default
   fallback assertions, then add characterization for pool identity
   (`binaryPath + cwd`), active versus idle refcounts, pending startup, and the
   existing whole-pool shutdown behavior that uninstall must not misuse.
2. In a focused diagnostic route test, characterize the existing
   `/opencode/server/resources` response and CLI metadata so installation work
   cannot silently alter or delete it.
3. Confirm Download Center's public contract has no enqueue/artifact route and
   its internal `DownloadTaskView` redacts URL/path/header data.

Do not weaken assertions to accommodate the new design. Change them deliberately
in later milestones when the expected interface changes.

**Verify**:

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/opencode/runtime-context.test.ts \
  tests/opencode-runtime.test.ts \
  tests/download-center.test.ts
```

Expected: all characterization tests pass against the pre-feature behavior.
Do not add tests for not-yet-created production symbols until the milestone
that implements those symbols; keep every commit green.

### Milestone 1: Commit one reviewed SDK-aligned release manifest

Create `apps/server/scripts/sync-opencode-runtime-manifest.mjs` and a checked-in
manifest under the OpenCode provider directory.

The script must:

1. Read the actual installed `apps/server/node_modules/@opencode-ai/sdk/package.json`
   version rather than parsing the caret range in `apps/server/package.json`.
2. Request only the matching official tag `v<SDK version>` from
   `api.github.com/repos/anomalyco/opencode/releases/tags/...`.
3. Select assets by an explicit target table. Use baseline x64 assets to avoid
   requiring non-baseline CPU instructions. Include Darwin arm64/x64, Windows
   arm64/x64, Linux glibc arm64/x64, and Linux musl arm64/x64.
4. Require every selected asset to provide a positive safe-integer size and a
   well-formed SHA-256 digest. Missing or duplicate assets are fatal.
5. Write deterministic JSON (stable target order, trailing newline) containing
   schema version, SDK/runtime version, tag, repository identity, and per-target
   asset name/size/digest. It may derive the public release URL at runtime from
   repository/tag/name; do not accept URLs from callers.
6. Support `--check`: generate in memory, compare with the checked-in manifest,
   print a concise mismatch, and exit nonzero without writing.
7. Never download the CLI binary. This is a manifest synchronizer, not a Desktop
   bundler.

Create a typed release reader/target resolver in the OpenCode provider package.
Inject the platform descriptor in tests. Linux libc selection must use an
explicit Node runtime signal; if the runtime cannot distinguish glibc from musl,
return unsupported and stop installation rather than guessing. Never select a
non-baseline x64 asset by CPU heuristic.

The first checked-in manifest stays at `1.17.11`. Do not opportunistically bump
to the current GitHub latest during this plan.

**Verify**:

```bash
pnpm --filter @cradle/server sync:opencode-runtime-manifest -- --check
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/opencode/runtime-release.test.ts
```

Expected: check exits 0; tests prove SDK-version equality, all supported target
mappings, baseline x64 selection, glibc/musl selection, unsupported targets, and
manifest rejection for missing/invalid size or digest.

### Milestone 2: Build the OpenCode-owned installer behind a small interface

Add an OpenCode provider-owned installation module. Keep its public interface
small:

```ts
interface OpencodeRuntimeInstallationService {
  boot(): Promise<void>
  status(): Promise<OpencodeRuntimeStatus>
  install(): Promise<OpencodeRuntimeStatus>
  uninstall(): Promise<OpencodeRuntimeStatus>
  shutdown(): Promise<void>
}
```

Implementation requirements:

1. Accept Download Center and filesystem/process dependencies in the constructor
   so tests do not touch real user data, network, or binaries.
2. Resolve the managed root only inside Server data. Validate all relative paths
   read from manifests with `resolve` plus inside-root checks before filesystem
   access.
3. Coalesce concurrent installs/uninstalls into one owner operation. Do not let
   two writers publish `current.json` or the same version directory.
4. Build the `DownloadRequest` only from the checked-in target manifest. Use the
   owner/source identity defined above, expected bytes, SHA-256, and a bounded
   `maxBytes` equal to the expected archive size. Use `findLatestRetryable` and
   `retry` before starting a new task.
5. Copy or extract the completed artifact into a unique OpenCode staging root.
   Always release the Download Center artifact after the staging copy/extraction
   no longer needs it, including failure paths.
6. Treat archives as hostile despite the pinned checksum. Reject absolute paths,
   `..` traversal, NUL, symlink/hardlink/device entries, duplicate executable
   entries, and an archive that contains no regular `opencode`/`opencode.exe`.
   Extract only the expected regular executable; do not publish arbitrary archive
   contents. Use existing `tar` and `extract-zip` dependencies unless their APIs
   cannot enforce these rules.
7. Set executable permissions on non-Windows, then run `<staged> --version` with
   a short timeout and ignored stdin. Parse an exact semantic version and require
   equality with the compatibility manifest. A mismatch fails before promotion.
8. Write a version-local `installation.json`, atomically promote the complete
   staging directory into `versions/<version>`, then atomically replace
   `current.json`. If the version directory already contains the exact verified
   installation, installation is idempotent.
9. On any error, delete only the operation's staging path and keep the prior
   current installation valid. Never roll back by rewriting an old executable.
10. `boot()` removes abandoned staging directories, validates `current.json`, and
    may prune non-current versions because no OpenCode pool lease exists yet. An
    invalid current manifest produces `missing`; it does not trust a stray file.
11. `shutdown()` stops accepting operations and awaits the current owner flight.
    Download Center shutdown cancels transfer; the installer must still finish
    staging cleanup before Server infrastructure closes.
12. `uninstall()` removes only managed state. It first asks the provider pool to
    dispose idle hosts for managed paths and rejects with 409 if any matching
    host has an active lease or pending startup. It never kills an active chat
    run merely to satisfy uninstall.

Use `AppError` codes for expected states, including at least:

- `opencode_runtime_not_installed` (409)
- `opencode_runtime_override_active` (409)
- `opencode_runtime_install_in_progress` only if coalescing cannot return the
  same operation (prefer coalescing)
- `opencode_runtime_in_use` (409)
- `opencode_runtime_target_unsupported` (409)
- `opencode_runtime_manifest_invalid` (500)
- `opencode_runtime_probe_failed` (422)

Do not persist raw upstream/spawn errors to the public status response. Download
Center continues to project its own redacted error codes.

**Verify**:

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/opencode/runtime-release.test.ts \
  src/modules/chat-runtime-providers/opencode/runtime-installation.test.ts
```

Expected: tests cover successful tar and zip flows through injected extractors,
checksum-bound request construction, resumable retry choice, single-flight,
idempotent reinstall, exact version probe, atomic switch, prior-version survival
on failure, artifact release, staging cleanup, path traversal/link rejection,
boot cleanup, unsupported target, configured override, active-lease uninstall
rejection, and managed-only uninstall.

### Milestone 3: Make every OpenCode caller resolve the same executable

Refactor `runtime-context.ts` and its tests:

1. Replace `resolveOpencodeBinaryPath()` with the structured resolution order in
   this plan. Preserve an explicit input override used by tests/callers.
2. Resolve PATH entries explicitly, including Windows `.exe`/PATHEXT behavior.
   If no executable exists, throw `opencode_runtime_not_installed` before spawn.
3. Carry `source/managed` through host acquisition. Pool identity remains
   absolute binary path plus cwd; do not split the same executable by display
   source.
4. When and only when `managed === true`, add
   `OPENCODE_DISABLE_AUTOUPDATE=1` to the spawned process environment. Preserve
   all existing user environment variables and native config ownership.
5. Add path-scoped pool inspection/disposal used by uninstall. Pending startup
   and `refCount > 0` count as in use. Idle entries may be closed and removed.
6. Ensure model inventory, agent discovery, session start/resume/fork, title
   generation, and every other host acquisition uses the shared resolver. An
   `rg` check must find no second `CRADLE_OPENCODE_PATH || 'opencode'` path.
7. Add an OpenCode `healthCheck` that probes resolution/version without starting
   `opencode serve`. Missing returns an unhealthy status with a stable message;
   configured/PATH/managed sources return healthy after a bounded `--version`
   probe. Health status must not expose an absolute path.

Update the OpenCode README to state the three sources, precedence, managed-only
auto-update suppression, SDK/runtime pin, Managed Resource declaration, and
side-by-side lease behavior.

**Verify**:

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/opencode/runtime-context.test.ts \
  src/modules/chat-runtime-providers/opencode/model-inventory.test.ts \
  src/modules/chat-runtime-providers/opencode/provider.test.ts
pnpm --filter @cradle/server typecheck
```

Expected: all pass. Tests explicitly cover configured > managed > PATH > missing,
managed-only environment injection, absolute PATH resolution, missing preflight,
health redaction, side-by-side pool acquisition, active/pending uninstall refusal,
and idle path disposal.

### Milestone 4: Register the OpenCode Managed Resource adapter

Add an OpenCode-owned adapter beside the installation service:

1. Always declare exactly `{ namespace: 'opencode', resourceType: 'runtime',
   resourceId: 'cli' }`, including when no binary exists or the current platform
   is unsupported. Unsupported hosts project `unavailable`; they do not hide the
   resource.
2. Map missing/installing/managed/external/configured and version mismatch states
   explicitly to Plan 056's descriptor vocabulary. Configured/PATH binaries use
   `installationSource: 'external'`; only a managed installed version behind the
   pinned target uses `update-available`. Add a table-driven test; do not infer
   status from Download Center history.
3. Map install/update/uninstall actions from owner truth. Install/update both
   call the same exact pinned-target installer as appropriate; configured
   override conflicts and active/pending lease conflicts are stable disabled
   reasons/409 errors. Uninstall removes only managed copies.
4. Make every archive DownloadRequest use the exact descriptor key. Its source
   ID/file name may describe the selected release asset, but `owner.resourceId`
   must not contain version, platform, asset name, or operation ID.
5. In `app.ts`, create one installation service from the existing Server
   Download Center, boot it before accepting requests, register its adapter into
   Plan 056's existing registry, and register `shutdown()` in the `drain` phase.
   Download Center remains the `cancel`-phase byte executor; OpenCode host
   shutdown remains in `stop`.
6. Keep contract/test construction injectable. Do not instantiate a hidden
   Download Center or second Managed Resource registry.
7. Preserve `GET /opencode/server/resources`; it remains process diagnostics and
   is not an installation endpoint.

**Verify**:

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/opencode/managed-resource-adapter.test.ts \
  tests/managed-resources.test.ts \
  tests/download-center.test.ts
pnpm --filter @cradle/server typecheck
pnpm --filter @cradle/cli typecheck
```

Expected: catalog tests cover pre-download declaration, successful install,
install failure mapping, configured override conflict, active-runtime uninstall
conflict, managed uninstall, exact task identity, response redaction, and
preservation of the process-resources route. Typechecks exit 0.

### Milestone 5: Verify the generic Resources experience

Do not create an OpenCode Settings component. Exercise the existing Plan 056
page with the real descriptor shape:

1. The OpenCode CLI row is visible before download and is grouped as an optional
   runtime resource.
2. Missing, configured external, PATH external, managed installed,
   update-available, installing, error, and unsupported states render through
   generic descriptor fields without branching on `namespace === 'opencode'`.
3. Install/update/uninstall use the existing generated Managed Resource commands
   with the exact key and no body. Targeted catalog invalidation converges after
   owner commands and terminal tasks.
4. Download progress joins on `{ opencode, runtime, cli }`. Failed transfers
   return to that declared row/action; Download Center itself gains no retry or
   installer semantics.
5. If `runtime` lacks a generic label/icon, add only that presentation mapping
   and required locale strings. Do not expose source path, release URL,
   checksum, archive name, or an OpenCode-specific form.

Do not automatically start installation when the user selects OpenCode. If the
runtime is missing, Server preflight returns the stable error and directs the
user to the Resources surface.

**Verify**:

```bash
pnpm --filter @cradle/web exec vitest run --config vite.config.ts --environment jsdom \
  src/features/managed-resources/managed-resources-page.test.tsx \
  src/features/managed-resources/projection.test.ts
pnpm --filter @cradle/web i18n:ci
pnpm --filter @cradle/web typecheck
```

Expected: generic tests cover the OpenCode descriptor states, install/update,
managed install over PATH, configured override disabled state, exact progress
join, mutation failure, uninstall, targeted invalidation, and resource retry
navigation. i18n and typecheck exit 0.

### Milestone 6: Close documentation, generation, and lifecycle verification

1. Update `apps/server/specs/capabilities/chat-runtime.md` and the OpenCode
   provider/module READMEs. State clearly: adapter/SDK built in, native CLI
   optional, no boot/selection auto-download, managed version aligned with SDK,
   external binaries operator-owned.
2. Run the manifest `--check`, focused suites, typechecks, boundary check, i18n,
   scoped lint, and diff hygiene from the command table. Regenerate clients only
   if the Plan 056 public contract actually changed; this plan should normally
   require no API/CLI generation.
3. Inspect `git diff --stat` and `git diff --name-status`. Confirm there is no DB
   migration, Desktop IPC/resource, binary/archive, user config, raw URL/path in
   public schemas, or source change outside the declared scope.
4. Confirm no executable or archive is tracked:

```bash
git diff --name-only --diff-filter=AM | rg '\.(zip|tar\.gz|exe)$|/(opencode|opencode\.exe)$'
```

Expected: no output.

5. Update Plan 047's index status only if its existing implementation and tests
   have actually been reconciled; do not mark it DONE merely because Plan 057
   consumes the live code. Plan 056 must already be DONE before executing this
   plan.

## Test plan

### Server unit tests

Use dependency injection and temporary directories. Model structure after
`apps/server/src/modules/download-center/service.ts` tests and
`runtime-context.test.ts`; do not make real network calls.

Required cases:

- release manifest SDK-version equality and deterministic `--check`;
- all eight supported platform/arch/libc mappings and unsupported target;
- x64 baseline asset selection;
- invalid/missing/duplicate upstream size/digest rejection;
- resolver precedence configured > managed > PATH > missing;
- configured relative/absolute command probing according to the documented
  override contract, plus Windows executable suffix handling;
- managed manifest inside-root enforcement and corrupt/escaping manifest
  rejection;
- exact DownloadRequest owner/source/checksum/size/maxBytes values;
- retryable task reuse and non-retryable new task behavior;
- archive traversal, absolute entry, link/device, duplicate executable, missing
  executable rejection;
- version probe timeout, malformed version, and mismatch;
- single-flight install and idempotent exact-version install;
- staging cleanup and prior current pointer preserved on every failure point;
- successful atomic promotion and artifact release;
- boot cleanup of staging and safe pruning of non-current versions;
- pool managed-only auto-update suppression;
- active/pending lease uninstall rejection; idle host disposal; managed uninstall;
- shutdown waits for cleanup after Download Center cancellation.

### Managed Resource integration tests

Use an injected fake installation service and isolated catalog/test app. Assert
descriptor shapes, exact key dispatch, stable AppError mapping, action gating,
and that serialized JSON never includes keys/values resembling URL, headers,
checksum, archive path, executable path, source details, or staging root.

### Web tests

Extend the existing generic Resources-page tests only where the real OpenCode
descriptor adds a state combination. Mock generated operations/transports, not
`fetch`. Assert user-visible state and action availability, not implementation
snapshots or namespace-specific JSX. No browser test is required.

### Regression suites

Run existing OpenCode provider/model-inventory tests because changing binary
resolution affects discovery and every session. Run Download Center tests
because retry/cancel/release behavior is security- and correctness-critical.

## Done criteria

All boxes must hold:

- [ ] OpenCode adapter/SDK remains registered without bundling a binary.
- [ ] `CRADLE_OPENCODE_PATH` wins and is never modified; managed wins over PATH;
  missing is detected before spawn with `opencode_runtime_not_installed`.
- [ ] The checked-in runtime manifest exactly matches installed SDK `1.17.11`
  and official `v1.17.11` asset names, sizes, and SHA-256 digests.
- [ ] No install path accepts caller URL/version/tag/checksum/path input.
- [ ] Archive validation, exact version probe, staging, immutable version
  directory, and atomic current-pointer switch are covered by passing tests.
- [ ] Managed `opencode serve` receives `OPENCODE_DISABLE_AUTOUPDATE=1`; external
  OpenCode processes do not receive a Cradle-owned config override.
- [ ] Active/pending leases block uninstall; idle managed hosts can be disposed;
  external binaries are never removed.
- [ ] Download Center owns transfer/cancel/resume/history and releases artifacts;
  OpenCode owns install truth and promotion.
- [ ] `/opencode/server/resources` remains compatible; the existing generic
  Managed Resource routes/CLI commands dispatch the OpenCode key and redact
  sensitive/internal fields.
- [ ] The OpenCode CLI is declared on the unified Resources page before download;
  install/update/uninstall and exact owner-scoped progress require no
  OpenCode-specific Settings component.
- [ ] No DB migration, Desktop runtime/IPC/resource, executable, archive, or user
  OpenCode config file is added.
- [ ] `pnpm --filter @cradle/server sync:opencode-runtime-manifest -- --check`
  exits 0.
- [ ] All focused Server/catalog/Web tests in the command table pass.
- [ ] Server, Web, and CLI typechecks pass; Server module boundaries pass.
- [ ] Web i18n validation and scoped ESLint pass.
- [ ] `git diff --check` emits no output.
- [ ] `git status --short` contains only declared plan files plus explicitly
  acknowledged pre-existing work; unrelated changes were not reverted.
- [ ] `plans/README.md` Plan 057 row is updated to DONE only after every criterion
  above is verified.

## STOP conditions

Stop and report instead of improvising if any condition occurs:

- The executor cannot obtain a clean worktree because current uncommitted changes
  overlap `app.ts`, Managed Resources, locales, generated clients, or another
  in-scope path.
- Plan 056 is not DONE or its live catalog no longer declares resources before
  transfer with exact identity and owner-dispatched commands.
- Plan 047's live Download Center no longer provides trusted internal
  `execute/retry/findLatestRetryable/release` with redacted public projection.
- Installed `@opencode-ai/sdk` is no longer `1.17.11`, or upstream tag
  `v1.17.11`/its selected assets no longer match the checked-in metadata.
- Any required official CLI asset lacks a positive size or SHA-256 digest.
- Linux libc cannot be determined from an explicit runtime signal. Do not guess
  glibc/musl, run `ldd`, or select by filename heuristic without operator review.
- The archive library cannot inspect and reject unsafe entry types/paths before
  publishing files. Do not extract the whole archive into the final directory.
- Supporting a target requires downloading an OpenCode Desktop application,
  package-manager installer, or non-CLI artifact.
- Correct installation requires writing outside the Cradle Server data namespace.
- Module-boundary validation requires a runtime cycle among the Managed Resource
  registry, OpenCode provider, Download Center, and Chat Runtime. Stop and
  redesign the seam rather than suppressing the checker.
- Uninstall cannot distinguish active/pending leases from idle hosts. Do not kill
  active OpenCode processes or delete a possibly running executable.
- Server shutdown can close infrastructure while promotion is still writing.
  Add explicit owner draining; do not rely on timing.
- Public/generated schemas expose an absolute path, source URL, headers,
  checksum, raw spawn error, or staging details.
- The implementation starts using OpenCode's global upgrade API, curl-to-shell,
  or a package-manager global install.
- The feature requires changing Plan 056's generic public descriptor or command
  contract. Stop and reconcile that owner seam explicitly rather than adding an
  OpenCode-only route or Web projection.
- A verification command fails twice after a reasonable plan-scoped fix, or a
  required fix expands beyond the in-scope files.

## Maintenance notes

- Treat the OpenCode SDK version and managed runtime manifest as one reviewed
  compatibility unit. A future SDK update must run the manifest synchronizer,
  inspect protocol/API changes, update the checked-in asset metadata, and run
  provider plus installer tests in the same change.
- Never change the managed channel to `latest` without defining a compatibility
  policy. Exact SDK-aligned versions are the initial contract.
- The OpenCode release target matrix can evolve. Prefer explicit new target
  entries and tests over CPU/libc filename heuristics.
- Side-by-side version directories are intentional for Windows and active
  leases. Old-version cleanup must remain boot-time or lease-aware.
- Reviewers should scrutinize archive entry validation, inside-root checks,
  atomic rename ordering, artifact release in every failure path, public
  redaction, and managed-only auto-update suppression.
- The Managed Resource registry is the provider-neutral declaration/dispatch
  interface. Keep release, extraction, activation, process, and uninstall
  semantics inside OpenCode; do not deepen it into a generic runtime installer.
- Optional follow-up: after Plan 057 lands, upgrade SDK/runtime together from
  `1.17.11` to a policy-accepted newer OpenCode release. That upgrade is not part
  of this plan.
