# Plan 038: Close the control-plane trust boundary across HTTP, SSE, WebSocket, and remote proxying

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before continuing. If a STOP condition occurs, stop and report instead of improvising. Update this plan's row in `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat 40ac6b3..HEAD -- apps/server/src/config apps/server/src/http apps/server/src/modules/remote-hosts apps/web/src/lib apps/web/src/api-gen apps/web/src/hooks`
> If an in-scope file changed, compare the current-state facts below with the live code. Material mismatch is a STOP condition.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `40ac6b3`, 2026-07-11

## Why this matters

Cradle is a local control plane with terminal, filesystem, secret, plugin, and remote-host capabilities. The server currently permits a non-loopback listener without authentication, while the browser client does not consistently carry credentials across generated HTTP, raw fetch, SSE, and WebSocket transports. The transparent remote-host gateway also forwards inbound authorization headers to a different authority. These gaps must be fixed as one transport architecture: patching only one protocol leaves another unauthenticated or leaks a credential across audiences.

## Current state

- `apps/server/src/config/server-config.ts:14-50` derives `authRequired` only from `CRADLE_AUTH_TOKEN` and `CRADLE_AUTH_REQUIRED`; it does not bind authentication policy to `CRADLE_HOST`.
- `apps/server/src/http/auth.ts:32-105` accepts bearer, `x-cradle-token`, relay token, and a WebSocket query token through one verifier.
- `apps/web/src/lib/client.config.ts:7-17` configures only `baseUrl`; no shared credential provider exists.
- `apps/web/src/lib/sync-socket/client.ts:129-151` opens `/sync` directly and cannot attach an HTTP authorization header.
- `apps/server/src/modules/remote-hosts/upstream.ts:68-78` removes only hop-by-hop headers. `authorization`, cookies, `x-cradle-token`, and relay credentials survive `filterHopByHopRequestHeaders` and are forwarded at lines 150-164.
- Existing server conventions: expected domain failures use `AppError`; HTTP contracts use Elysia schemas; OpenAPI generation is the source for web and CLI clients. Follow `apps/server/AGENTS.md`.

## Target architecture

Define an explicit exposure policy:

```ts
type ExposureMode
  = { kind: 'loopback' }
  | { kind: 'lan', credentialSource: 'configured-token' }
  | { kind: 'relay' }
```

- Loopback may start without a configured token. Any non-loopback bind must fail startup unless a supported credential source is configured.
- All browser transports use one `CradleCredentialProvider`. HTTP and SSE inject a bearer header. WebSocket obtains a single-use, short-lived ticket from an authenticated HTTP endpoint and sends only that ticket during upgrade.
- Credentials have an audience. Local control-plane credentials must never be forwarded to a remote Cradle server. The remote host record/connection owns any upstream credential.
- Upstream request headers are rebuilt from an allowlist; credential and ambient browser headers are denied regardless of casing.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Server typecheck | `pnpm --filter @cradle/server typecheck` | exit 0, no errors |
| Web typecheck | `pnpm --filter @cradle/web typecheck` | exit 0, no errors |
| Focused server tests | `pnpm --filter @cradle/server exec vitest run src/config src/http src/modules/remote-hosts --maxWorkers=1` | all pass |
| Focused web tests | `pnpm --filter @cradle/web exec vitest run src/lib src/hooks --maxWorkers=1` | all pass |
| Contract generation | `pnpm generate:web` | exit 0; generated client reflects ticket endpoint |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `apps/server/src/config/server-config.ts` and tests.
- `apps/server/src/http/auth.ts` and tests.
- A small server-owned WebSocket ticket service under `apps/server/src/http/`; ticket route registration in the HTTP composition layer.
- `apps/server/src/modules/remote-hosts/upstream.ts` and focused tests.
- `apps/web/src/lib/client.config.ts`, raw transport helpers, SSE helpers, and `apps/web/src/lib/sync-socket/client.ts`.
- Generated web API files changed only through `pnpm generate:web`.
- Documentation for exposure modes and credential audiences.

**Out of scope**:

- User accounts, multi-user RBAC, OAuth, or cloud identity.
- Persisting the local master token in IndexedDB/localStorage.
- Sending a long-lived credential in a WebSocket query string.
- TLS termination and certificate provisioning.
- Changing relay cryptographic enrollment semantics.
- Symlink/workspace policy.

## Steps

### Step 1: Make exposure policy fail closed

Add a canonical loopback-address classifier covering `127.0.0.0/8`, `::1`, and normalized localhost only where the bind implementation resolves it safely. Parse configuration into an explicit exposure mode. Reject startup when a non-loopback host lacks a credential source; do not silently generate a token that no client can retrieve. Keep the default `127.0.0.1` behavior.

**Verify**: focused config tests must cover default loopback, IPv4/IPv6 loopback, `0.0.0.0`, `::`, LAN IP, and hostname cases; server typecheck exits 0.

### Step 2: Introduce the browser credential provider

Create one web-owned `CradleCredentialProvider` interface with an in-memory implementation. Configure the generated client through its supported auth callback rather than editing generated code. Route all hand-written fetch/EventSource replacements through transport helpers that consume the same provider. Desktop credentials must arrive through the existing preload boundary; never expose environment variables directly to renderer code.

If native `EventSource` prevents header injection, replace it with a fetch-stream adapter or use a short-lived ticket endpoint. Do not fall back to a long-lived query token.

**Verify**: focused web tests assert generated HTTP and each raw helper use the same current credential and do not persist it.

### Step 3: Add single-use WebSocket tickets

Add an authenticated HTTP endpoint that mints a random ticket with a strict audience (`sync`), short expiry, and single-consumption semantics. Store only a digest in a bounded in-memory registry. Consume the ticket atomically during WebSocket verification. Reject replay, expiry, wrong audience, and missing authentication. Do not log ticket material.

**Verify**: auth tests cover mint/use, replay, expiry, wrong audience, and registry pruning; all focused server tests pass.

### Step 4: Rebuild upstream headers and separate credential audiences

Replace `filterHopByHopRequestHeaders` with an allowlist-based builder. Never forward `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-cradle-token`, `x-cradle-relay-token`, or WebSocket tickets from the inbound request. Inject an upstream credential only from the selected remote-host connection/credential owner. Reject credential injection to an untrusted cleartext destination unless the connection is an established loopback tunnel.

**Verify**: table-driven tests cover mixed casing, duplicate headers, direct HTTP, tunnel URLs, and a remote-specific credential; local credentials never appear in the captured upstream request.

### Step 5: Regenerate contracts and document the boundary

Regenerate web contracts, update server/web transport documentation, and document the three exposure modes plus credential audiences. Add an integration test proving authenticated HTTP and `/sync` work through the same client credential bootstrap.

**Verify**: generation, both typechecks, focused tests, and `git diff --check` all pass.

## Test plan

- Use `apps/server/src/http/auth.test.ts` as the server auth test pattern.
- Extend remote-host upstream tests with explicit forbidden-header assertions.
- Add web transport tests with a fake credential provider; assert rotation of the in-memory credential is observed without recreating every caller.
- Add one integration test for authenticated HTTP → ticket mint → WebSocket connect.
- Add startup configuration tests; do not require real external network access.

## Done criteria

- [ ] Non-loopback startup without a supported credential source fails with a clear configuration error.
- [ ] Generated HTTP, raw fetch/SSE, and WebSocket use one credential provider.
- [ ] No long-lived credential is placed in a URL.
- [ ] WebSocket tickets are audience-bound, expiring, single-use, and digest-only in memory.
- [ ] Remote proxy tests prove local and relay credentials are stripped.
- [ ] Server and web typechecks exit 0; focused tests pass.
- [ ] `git diff --check` returns no output.
- [ ] `plans/README.md` status is updated.

## STOP conditions

- A browser transport cannot be authenticated without persisting or URL-embedding a long-lived credential.
- Remote-host records have no authoritative place to attach a remote-specific credential and adding one requires an unplanned database migration.
- The server bind layer resolves hostnames in a way that makes a deterministic loopback classification impossible; report the actual listener behavior first.
- Contract generation would require hand-editing generated files.

## Maintenance notes

- Treat every future transport as a new credential audience; it must integrate through the credential provider and have an explicit server verifier.
- Reviewers should search request logging and observability payloads for accidental credential/ticket capture.
- Multi-user authorization is deliberately deferred; this plan establishes authenticated single-operator control-plane semantics.

