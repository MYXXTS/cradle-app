# Plan 039: Replace environment-bound secret rotation with an atomic runtime keyring

> **Executor instructions**: Follow every step and verification gate. This plan handles encryption keys; stop on any ambiguity rather than inventing recovery behavior. Update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat 40ac6b3..HEAD -- apps/server/src/modules/secrets packages/db/src/schema packages/db/drizzle`
> Material drift in the encryption envelope, credentials schema, or rotation route is a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 038
- **Category**: security
- **Planned at**: commit `40ac6b3`, 2026-07-11

## Why this matters

Plan 007 added ciphertext versioning and transactional re-encryption, but the process still reads `CRADLE_CREDENTIAL_SECRET` for every normal encrypt/decrypt operation. After `/secrets/rotate` commits ciphertext encrypted with the supplied target key, the running process continues using the old environment value. Reads fail immediately and subsequent writes can create an unrecoverable mixed-key dataset. Rotation must be owned by a runtime keyring whose active key changes only after the database commit succeeds.

## Current state

- `apps/server/src/modules/secrets/service.ts:71-80` reads key material directly from `process.env` and derives the cipher key.
- `apps/server/src/modules/secrets/service.ts:87-94` infers the active key version from stored rows rather than a key authority.
- `apps/server/src/modules/secrets/service.ts:382-431` accepts old and new plaintext secrets, re-encrypts rows transactionally, but never changes the process's active key.
- `apps/server/src/modules/secrets/index.ts:24-30` exposes rotation as an HTTP route accepting key material.
- Existing encrypted envelopes use `vN:iv:payload:tag`; legacy unversioned envelopes are still readable. Preserve this compatibility unless tests prove no legacy data exists.

## Target architecture

Introduce a server-owned `CredentialKeyring` initialized once during bootstrap. It owns active key material and version, encryption, decryption, rotation staging, and activation. Normal service functions receive/read the keyring through infrastructure composition; they do not access the environment.

Rotation protocol:

1. validate the current key can decrypt every row;
2. stage the next key in memory;
3. re-encrypt every row inside one Drizzle transaction;
4. commit the database transaction;
5. atomically activate the staged key;
6. on any failure, keep both DB and active key on the old version.

The runtime HTTP API must not accept master key plaintext. Prefer a local administrative CLI/process-start workflow; if no secure local channel exists, disable the route and document restart-based rotation until one is designed.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Typecheck | `pnpm --filter @cradle/server typecheck` | exit 0 |
| Focused tests | `pnpm --filter @cradle/server exec vitest run src/modules/secrets --maxWorkers=1` | all pass |
| Database tests | `pnpm --filter @cradle/server exec vitest run tests/database.test.ts --maxWorkers=1` | all pass |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `apps/server/src/modules/secrets/` service, keyring, composition, tests, and README.
- Server infrastructure/bootstrap files required to initialize and dispose the keyring.
- Removal or disabling of the plaintext-key HTTP rotation route and regenerated contracts if its public contract changes.
- A database migration only if an explicit active key version record is proven necessary.

**Out of scope**:

- OS keychain/KMS integration.
- Changing AES-GCM or deriving per-credential keys.
- Deleting legacy envelope support without migration evidence.
- Automatic rotation on a timer.
- Returning key material through any API, log, error details, or observability event.

## Steps

### Step 1: Contain the unsafe rotation path

Before refactoring, add a regression test that demonstrates normal reads and writes must continue after a successful rotation. Disable the HTTP route if the complete keyring cannot land atomically in the same change. Regenerate clients rather than leaving a dead generated contract.

**Verify**: the regression test fails against the old implementation for the expected reason; after containment, no remotely callable route accepts master key material.

### Step 2: Introduce `CredentialKeyring`

Create a small keyring module with typed active/staged state. Initialize it once from configuration. Keep raw key material private to the module; expose encrypt/decrypt/rotate operations only. Replace direct `process.env` reads in normal secret operations with the keyring.

**Verify**: `rg -n "CRADLE_CREDENTIAL_SECRET|process\.env" apps/server/src/modules/secrets` returns matches only in the designated bootstrap/config boundary and tests.

### Step 3: Implement commit-then-activate rotation

Preflight-decrypt all rows with the active key, stage the target key/version, and perform re-encryption in one Drizzle transaction. Activate the staged key only after the transaction callback returns successfully. Ensure exceptions clear staged state and leave the old key active. Serialize concurrent rotations and normal writes so no write can choose an inferred/new version during the transition.

**Verify**: focused tests cover successful rotation followed by read and write, failure before first update, failure mid-transaction, activation failure handling, and concurrent write/rotation ordering.

### Step 4: Define restart and recovery semantics

Document how the next process receives the new key. A rotation is not complete unless the next bootstrap configuration can supply the active version's material. If this requires an operator-managed key bundle, define its schema and validate all stored versions at startup. Do not add a heuristic that guesses which key decrypts a row.

**Verify**: bootstrap tests cover correct active key, stale old key, missing version material, and legacy ciphertext. Failures must be explicit before runtime services start.

### Step 5: Regenerate contracts and update docs

If the HTTP route is removed or replaced with a non-secret status endpoint, regenerate web and CLI contracts. Update the secrets README with rotation phases, crash points, and recovery procedure.

**Verify**: typecheck, focused tests, database tests, contract drift check, and `git diff --check` pass.

## Test plan

- Extend `apps/server/src/modules/secrets/service.test.ts` using its existing in-memory database fixtures.
- Preserve legacy envelope tests.
- Add crash-point tests around transaction commit and key activation.
- Assert errors and logs never contain supplied key material.
- Add a restart/bootstrap test using only synthetic test keys.

## Done criteria

- [ ] Normal secret code no longer reads key material directly from `process.env`.
- [ ] Successful rotation is followed by successful read and write in the same process.
- [ ] Failed rotation leaves all rows and the active key unchanged.
- [ ] Concurrent writes cannot produce mixed key versions.
- [ ] No remotely callable endpoint accepts old/new master key plaintext.
- [ ] Startup rejects missing or stale key material before runtime activation.
- [ ] Focused tests, database tests, server typecheck, and `git diff --check` pass.

## STOP conditions

- The next process cannot obtain the newly active key without storing plaintext key material in the database.
- More than one process can write the same credential database concurrently; this requires a cross-process lease design before rotation.
- Existing production envelopes use undocumented key derivation or multiple independent master keys.
- A schema migration becomes destructive or cannot be validated against historical database fixtures.

## Maintenance notes

- OS keychain/KMS ownership remains a separate follow-up; `CredentialKeyring` is the seam for it.
- Reviewers should focus on the exact boundary between database commit and in-memory activation.
- Never infer active versions by scanning ciphertext rows after this plan.

