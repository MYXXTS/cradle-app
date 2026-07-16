# Plan 058: Add a user-selectable, crash-safe desktop server data directory

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fa17597..HEAD -- apps/desktop apps/web packages/cli plans/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `fa17597`, 2026-07-16

## Why this matters

The Windows installer lets users place the application on another drive, but
the desktop server data remains under Electron's default `userData` directory,
normally `%APPDATA%\\Cradle` on C:. Users therefore cannot move the database,
logs, runtime state, Chronicle resources, or other server-owned files to a
larger/faster E: drive. The current code also hard-codes the data path in
several desktop modules, so adding one setting without a central owner would
leave the server and native diagnostics looking at different directories.

This plan introduces a desktop-owned data-root resolver with a small fixed
bootstrap/locator file, a Settings action to choose a directory later, and a
restart-safe migration protocol. The Electron `userData` directory remains in
its platform default location for Chromium caches, window state, updater state,
and the CLI locator; only the server data root moves. A failed or interrupted
migration must leave the old root usable.

The requested `.bak -> cp -> rm` idea is deliberately reordered. The source
must remain intact while the destination is copied and verified; only after the
new root has booted successfully may the old root be renamed to a dated
`.bak` directory. Deletion is a separate, delayed cleanup action.

## Current state

### Desktop data path is hard-coded

- `apps/desktop/src/main/server-process.ts` owns the child server lifecycle and
  currently computes the root as:

  ```ts
  const dataDir = join(app.getPath('userData'), 'data')
  ```

  at lines 150–165. The same file also reads/writes server exit diagnostics and
  the server auth token below `app.getPath('userData')/data` (around lines 403
  and 657).
- `apps/desktop/src/main/native-services.ts:251-257` reports
  `serverDataPath`, `databasePath`, and `serverLogPath` by joining
  `app.getPath('userData')` with `data`.
- `apps/desktop/src/main/native-services.ts:119` reads desktop preferences from
  the same hard-coded `data/preferences/desktop.json` path.
- `apps/desktop/src/main/main-app.ts:681-715` creates the desktop services and
  then calls `startServer()`. There is no data-root initialization or migration
  phase before server startup.

### Server already accepts an explicit root

- `apps/server/src/config/server-config.ts:31-53` resolves
  `CRADLE_DATA_DIR` and derives `cradle.db`, `server.log`, and module-owned
  paths from it. This is the server-side seam to preserve; do not add another
  server configuration variable for the same concept.
- `apps/server/src/config/server-config.ts:91` creates the database parent
  directory, so the desktop resolver should pass an absolute, validated root
  and let the existing server config create its children.

### Existing UI already exposes the path

- `apps/web/src/features/settings/support-settings.tsx:233-240` calls
  `nativeIpc.native.getCradleDataPaths()` and reveals
  `paths.serverDataPath`.
- `apps/web/src/features/settings/about-settings.tsx:90-97,130-137` displays
  the same path read-only.
- `apps/web/src/lib/electron.ts:314-319` defines the typed renderer IPC
  surface. Native methods are registered through the `IpcService` pattern in
  `apps/desktop/src/main/native-services.ts` and exposed by the generated IPC
  client; follow that pattern instead of adding an ad-hoc `ipcMain.handle`.
- `apps/web/src/features/settings/README.md` states that `support-settings.tsx`
  owns the Cradle data-directory reveal surface. Extend that surface rather
  than creating a new settings section.

### Bootstrap and CLI constraints

- `packages/cli/src/runtime/server-locator.ts:14-28` uses
  `CRADLE_DESKTOP_USER_DATA_DIR` or the platform default
  `%APPDATA%\\Cradle` to find `cli/server.json`. Keep that locator in the fixed
  Electron `userData` root so CLI discovery does not depend on a drive letter
  or a moved server database.
- `apps/desktop/src/main/server-process.ts:169-172` writes that locator below
  `app.getPath('userData')`. Do not move it into the configurable server data
  root.

### Repository verification commands

The root scripts in `package.json` are the canonical checks:

```bash
pnpm typecheck
pnpm test
pnpm --filter @cradle/desktop typecheck
pnpm --filter @cradle/server typecheck
pnpm --filter @cradle/server check:boundaries
pnpm --filter @cradle/server test
pnpm lint
```

The repository may have unrelated full-lint failures; report those separately
and ensure all touched files pass scoped ESLint checks.

## Target design

### Ownership and paths

Add one desktop-main module, for example
`apps/desktop/src/main/data-directory.ts`, as the sole owner of the active
server data root and migration state. It must expose typed functions similar to:

```ts
interface DesktopDataDirectoryState {
  bootstrapRoot: string
  serverDataRoot: string
  source: 'default' | 'custom'
  pendingMigration: DesktopDataMigration | null
}
```

The default root is `join(app.getPath('userData'), 'data')`. A custom root is an
absolute path chosen by the user. Store the active custom-root pointer in a
small fixed file under the bootstrap root, such as
`<userData>/bootstrap/data-root.json`. Write this file through a sibling temp
file followed by `rename`; never partially overwrite it. The pointer file must
contain a schema version, the absolute root, and a migration id/last-success
timestamp. Invalid, missing, or unreadable pointer files fall back to the
default root and produce a diagnostic warning rather than preventing startup.

Do not call `app.setPath('userData')`. Electron's `userData` remains the
bootstrap/cache root. Every Cradle server-owned path must be derived from the
resolver, including the server process, auth token, exit diagnostics, desktop
preferences read by the native launcher, and the data-path IPC response.

### Migration state machine

Use a typed manifest under the fixed bootstrap root, for example
`bootstrap/data-migration.json`, with `sourceRoot`, `targetRoot`, a unique
`migrationId`, phase, and timestamps. The operation is idempotent and has these
phases:

1. **validate**: resolve both paths, reject relative paths, the current root,
   the install directory, and any target that is inside the source root. The
   target must be a local directory on a fixed drive, writable by the current
   user, and either empty or a Cradle migration staging directory created by
   the same migration id. Do not overwrite arbitrary user files.
2. **stage-copy**: create a sibling staging directory on the target volume,
   such as `<target>.cradle-migrating-<migrationId>`. Copy the complete server
   data tree, including hidden files and the credential/auth files. Keep the
   source untouched. Copy into the staging directory, never directly over the
   final target.
3. **verify**: produce a deterministic manifest of relative path, file type,
   byte size, and SHA-256 for every regular file. Compare source and staging
   manifests, and verify the expected database file and credential files exist
   when they existed in the source. Do not replace this with a file-count or
   size-only heuristic. The copy may be I/O-heavy, but it is a one-time safety
   operation and avoids silently corrupting SQLite/WAL or secret files.
4. **promote**: write a marker file in the staging directory, then rename the
   staging directory to the requested target when the target path is on the
   same volume. If the target already exists as a prior Cradle root, use a
   second staging sibling and refuse promotion until the existing target is
   explicitly archived; never merge two active roots implicitly.
5. **switch-pointer**: atomically replace `bootstrap/data-root.json` with the
   target root. The old pointer is retained as a `.bak` file until boot health
   succeeds. This is the commit point; before it, the old root remains active.
6. **health-check**: restart the desktop server using the new root and wait for
   the existing server readiness check. If startup fails, restore the old
   pointer atomically, leave the source untouched, mark the target as failed,
   and relaunch against the source.
7. **archive-old-root**: only after the new server is ready, rename the old
   root to `<source>.bak-<timestamp>` on the source volume. Keep at least one
   backup until the next successful app start and expose its presence in the
   migration status. Never delete the backup in the same transaction as the
   pointer switch.
8. **cleanup**: provide a separate, explicit cleanup path (or a later startup
   retention task) that deletes only a verified, inactive `.bak-*` root. A
   failed copy, failed health check, or interrupted process must never trigger
   cleanup.

If the process dies with a pending manifest, the next startup must inspect the
phase and either resume copying into the same migration-id staging directory
or roll back to the last valid pointer. It must never infer success merely
because the target directory exists.

### Restart and UI behavior

Changing the root is a restart operation. Add a native IPC method that opens a
directory chooser, validates the selection, asks the main process to schedule a
migration, and returns a typed result indicating the chosen path and whether a
restart is required. The main process owns the actual copy; the renderer must
never receive a source path with permission to perform filesystem migration.

Extend the desktop server status contract with a migration/starting state (or a
separate migration-status IPC event) so Settings can show `preparing`,
`copying`, `verifying`, `switching`, `failed`, and `completed` without guessing
from a spinner. Existing readiness consumers must continue treating migration
as not-ready, not as a server failure.

In `support-settings.tsx`, add a “Change data location” action below the
existing reveal action. The flow is: choose directory → show source/target and
that Cradle will restart → confirm → disable the action while migration is
pending → restart automatically. On failure, show the returned error and keep
the old path displayed. Reuse existing Settings row, AlertDialog, Button, and
i18n conventions; do not add dynamic Tailwind class names.

Update the About display to show the active server root and whether it is the
default or custom location. Keep the existing `userDataPath` field for support
diagnostics so users can distinguish Electron bootstrap data from server data.

## Scope

**In scope** (the only files/areas to modify):

- `apps/desktop/src/main/data-directory.ts` (new resolver and migration owner)
- `apps/desktop/src/main/server-process.ts`
- `apps/desktop/src/main/main-app.ts`
- `apps/desktop/src/main/native-services.ts`
- `apps/desktop/src/main/README.md`
- `apps/desktop/src/shared/server-runtime.ts`
- `apps/desktop/src/preload/index.ts` if the typed preload surface requires it
- `apps/desktop/src/main/data-directory.test.ts` (new)
- `apps/desktop/src/main/server-process.test.ts`
- `apps/desktop/src/main/native-services.test.ts` only if a native path contract
  test is needed by the existing test seam
- `apps/web/src/lib/electron.ts`
- `apps/web/src/lib/server-readiness.ts`
- `apps/web/src/env.d.ts`
- `apps/web/src/features/settings/support-settings.tsx`
- `apps/web/src/features/settings/support-settings.test.tsx` (new, if no
  existing focused test can own the coverage)
- `apps/web/src/features/settings/about-settings.tsx`
- `apps/web/src/features/settings/README.md`
- Existing locale files/locale defaults for the new Settings strings

**Out of scope** (do not touch):

- Electron's `app.setPath('userData')`, Chromium cache relocation, window-state
  relocation, or updater-directory relocation.
- The installer layout or NSIS install-directory behavior. The feature must
  work regardless of whether the executable is on C:, E:, or another local
  drive.
- Moving desktop marketplace plugins, Download Center task artifacts, or
  updater caches. Those remain Electron-desktop-owned until a separate storage
  ownership plan covers them.
- Any database schema/migration. The existing SQLite file is copied as a
  filesystem artifact while the server is stopped.
- Chronicle's user-configured capture `storageRoot` semantics. It may point
  outside the server root and must not be silently rewritten by this feature.
- CLI protocol changes or a second CLI locator. The fixed `userData/cli` locator
  remains authoritative.

## Git workflow

- Branch: follow the repository's existing branch convention; if none is
  required, use `advisor/058-configurable-desktop-data-directory`.
- Match the repository's existing commit style (recent history uses
  conventional-style `feat(...)`/`fix(...)` subjects).
- Do not push or open a PR unless separately instructed.

## Steps

### Step 1: Add the central data-root resolver and typed pointer state

Create `apps/desktop/src/main/data-directory.ts`. Implement default-root
resolution, pointer-file parsing with a versioned schema, absolute-path
normalization, atomic JSON writes, and a read-only state accessor. Keep all
filesystem operations in this module and return typed errors suitable for
native IPC/UI display. Add tests for default fallback, valid custom paths,
malformed pointer files, relative paths, and path normalization on POSIX test
fixtures plus Windows-style path fixtures.

**Verify**: `pnpm exec vitest run apps/desktop/src/main/data-directory.test.ts` →
all resolver tests pass.

### Step 2: Route every server-owned desktop path through the resolver

Update `server-process.ts`, `native-services.ts`, and the startup path in
`main-app.ts` to use one active `serverDataRoot` value. Replace every
`join(app.getPath('userData'), 'data', ...)` occurrence in the desktop main
code with the resolver. Preserve the fixed `userData/cli/server.json` locator,
and keep `CRADLE_DATA_DIR` as the only server environment variable. Extend
`getCradleDataPaths()` with the active root/source metadata while preserving
the existing fields for renderer compatibility.

**Verify**: `rg -n "join\\(app\\.getPath\\('userData'\\), 'data'" apps/desktop/src/main`
→ no matches outside tests/docs; `pnpm --filter @cradle/desktop typecheck` →
exit 0.

### Step 3: Implement the crash-safe copy/verify/promote migration service

Add the migration phases described above to `data-directory.ts` or a focused
desktop-main helper owned by it. Use a deterministic recursive file manifest
and SHA-256 verification, preserve hidden files, refuse unsafe/non-empty
targets, write phase updates atomically, and make recovery idempotent by
`migrationId`. Add explicit helpers for archiving the old root to a dated
`.bak-*` path and for deleting only an inactive, completed backup. Do not call
`rm` on the source before pointer switch and health-check success.

**Verify**: `pnpm exec vitest run apps/desktop/src/main/data-directory.test.ts`
→ migration tests pass for same-volume and cross-volume-like temp roots,
copy failure, checksum mismatch, pointer-write failure, interrupted phase
recovery, and `.bak` retention; no test deletes the active source root.

### Step 4: Integrate migration with desktop lifecycle and readiness

Add native-main methods to choose/schedule a target and to report migration
status. Ensure the actual operation runs only after the desktop server and
desktop-owned resources have stopped, or on the next startup before launching
the server. Publish progress through the existing desktop status mechanism (or
a narrowly scoped migration-status event), and treat migration as “not ready”
in `apps/web/src/lib/server-readiness.ts`. On failure, restore the old pointer
and relaunch/restart against the source root. On success, restart using the new
root and keep the old root as `.bak-*`.

**Verify**: `pnpm exec vitest run apps/desktop/src/main/server-process.test.ts`
→ existing server lifecycle tests plus new data-root injection/restart tests
pass; `pnpm --filter @cradle/desktop typecheck` → exit 0.

### Step 5: Add Settings support for changing the location later

Extend the typed renderer IPC contracts and update
`support-settings.tsx` with choose → confirm → restart behavior, active-path
and source metadata, disabled/pending states, and migration failure display.
Update `about-settings.tsx` to distinguish the fixed Electron user-data path
from the active server-data root. Add translated strings to every locale file
that has a Settings translation bundle, following the existing key naming and
fallback conventions. Reuse design-system primitives and `cn()` for any
conditional classes.

**Verify**: `pnpm --filter @cradle/web typecheck` → exit 0; run the focused
Settings tests (or add them if absent) → all pass; `pnpm exec eslint
apps/web/src/features/settings/support-settings.tsx apps/web/src/features/settings/about-settings.tsx
apps/web/src/lib/electron.ts` → exit 0.

### Step 6: Add regression coverage and documentation

Add native IPC/path contract tests following the existing desktop test mocks,
and Settings tests for the confirmation/cancel/failure states using the
existing Settings component test patterns. Document the distinction between
Electron bootstrap data and movable server data in
`apps/desktop/src/main/README.md` and `apps/web/src/features/settings/README.md`.
Include the backup retention and manual cleanup behavior; do not promise that
the installer drive automatically controls the data drive.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all tests pass; `git diff
--check` → no whitespace errors.

## Test plan

Add focused tests covering:

- Pointer parsing: missing/malformed/version-mismatched file falls back to the
  default root without throwing; valid custom absolute paths are preserved.
- Path safety: reject relative paths, the install directory, source/target
  overlap, current-root no-ops, non-empty arbitrary directories, and paths that
  cannot be created/written.
- Copy protocol: hidden files, nested directories, credential/auth files, and
  an empty source; manifest checksum mismatch leaves the source active.
- Recovery: process interruption at each manifest phase resumes or rolls back
  by migration id; pointer replacement is atomic; old root is only renamed to
  `.bak-*` after a simulated healthy boot.
- Failure safety: copy, verification, pointer-write, and health-check failures
  leave the source root intact and do not delete any active files.
- Desktop path contract: `getCradleDataPaths()` reports the configured server
  root while `userDataPath` and `cli/server.json` remain fixed.
- Settings UX: cancel leaves state unchanged, confirmation schedules a restart,
  pending migration disables duplicate requests, and failure keeps the old
  path visible.

Use `apps/desktop/src/main/server-process.test.ts` for Electron mocks and
`apps/web/src/features/settings/use-app-preferences.test.tsx` plus existing
Settings dialog tests for renderer conventions. Avoid browser/E2E tests; this
feature is best verified through filesystem, lifecycle, IPC, and component
unit tests.

## Done criteria

- [ ] `pnpm --filter @cradle/desktop typecheck` exits 0.
- [ ] `pnpm --filter @cradle/server typecheck` exits 0.
- [ ] `pnpm --filter @cradle/server check:boundaries` exits 0.
- [ ] `pnpm --filter @cradle/server test` exits 0.
- [ ] `pnpm --filter @cradle/web typecheck` exits 0.
- [ ] `pnpm test` exits 0, including the new migration and Settings tests.
- [ ] No production desktop-main code still hard-codes
      `join(app.getPath('userData'), 'data', ...)`.
- [ ] A failed or interrupted migration leaves the old root bootable and does
      not remove the active source directory.
- [ ] The old root is renamed to `.bak-*` only after a successful new-root
      server readiness check; deletion is a separate cleanup operation.
- [ ] `pnpm exec eslint` passes for all touched source files.
- [ ] `git diff --check` exits 0 and no files outside the Scope list are
      modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back instead of improvising if:

- The current server data root is found to contain files owned by another
  product or runtime that cannot be copied safely as a stopped filesystem tree.
- Any required path is opened by a long-lived desktop resource after the
  lifecycle shutdown point, making a consistent copy impossible.
- The target directory would require merging arbitrary pre-existing files;
  do not silently overwrite or delete them.
- Cross-volume promotion cannot be made atomic with the selected Windows/Node
  APIs. Keep the source pointer active and report the exact failure rather than
  inventing a best-effort rename.
- The codebase has drifted so the listed hard-coded paths or IPC contracts no
  longer match; update the plan or request review before editing.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- Keep the fixed bootstrap root and movable server root distinct. Future code
  that needs durable server files must request the resolver's active root; it
  must not reconstruct `app.getPath('userData')/data` itself.
- Reviewers should scrutinize Windows path normalization, junction/symlink
  handling, cross-volume behavior, shutdown ordering, and whether every
  pointer/phase write is atomic and idempotent.
- Do not delete `.bak-*` roots automatically in the same release that first
  introduces migration. Add retention telemetry and an explicit cleanup policy
  only after real-world migration failures are understood.
- Moving Electron marketplace plugins, updater artifacts, or Chronicle's
  independently configured capture root is intentionally deferred. A future
  plan must define those ownership boundaries before including them in this
  migration protocol.
