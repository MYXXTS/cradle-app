# Plan 048: 发布安全的 Provider Endpoint catalog projection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e3d008c..HEAD -- apps/server/src/modules/provider-catalog apps/web/src/features/agent-management apps/web/src/features/agent-runtime apps/web/src/generated`
> If an in-scope file changed, compare it with the contracts below. Any change
> to endpoint matching, auth projection, import flow, or generated operations
> is a STOP condition until reconciled.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/035-model-layer-unification.md` (core M0-M6 landed; reconcile status before execution)
- **Category**: correctness, tech-debt, tests
- **Planned at**: commit `e3d008c`, 2026-07-14

## Why this matters

Server 与 Web 分别维护 Provider Endpoint template。Server registry 已包含 Volcengine Ark、path-prefix matching、provider-kind filtering，以及 runtime-only `anthropicWireAuth`；Web mirror 只有 DeepSeek/Xiaomi，且只匹配 hostname。Import Provider 因而无法识别 Server 已支持的 Volcengine endpoint，也可能跨 provider kind 误匹配。

目标状态是 Server Provider Catalog 拥有唯一 canonical registry，并发布一个显式去除 runtime auth policy 的安全 projection。Web 通过 generated SDK 加载一次 catalog，在本地以同一纯 matcher 完成即时输入反馈和 custom-model bootstrap，不在每次按键时请求 Server。

## Current state

- `apps/server/src/modules/provider-catalog/provider-endpoint-registry.ts:12-67` 定义 canonical templates；Volcengine entry 包含 `/api/coding` 与 `anthropicWireAuth: 'bearer-token'`。
- 同文件 `:72-110` 已正确实现 hostname boundary、path prefix 与 optional provider-kind matching。
- `apps/web/src/features/agent-management/provider-endpoint-registry.ts:1-67` 声称 mirror Server，但缺少 Volcengine、`pathPrefixes` 与 provider-kind filter。
- `apps/web/src/features/agent-management/import-provider-dialog.tsx:271` 用 Web mirror 自动写 custom models；`:574` 用它显示 detected-provider hint。
- `apps/server/src/modules/provider-catalog/catalog.test.ts:306-317` 已覆盖 Volcengine runtime auth resolution，但没有验证可公开 DTO 不泄漏该 policy。
- `apps/server/src/modules/provider-catalog/index.ts` 已拥有 `/providers` route namespace；`model.ts` 拥有公开 TypeBox contract。

安全边界：`anthropicWireAuth` 决定 credential wire behavior，属于 Server runtime policy，不是 UI catalog data。公开 DTO 只允许 `id`、`name`、`providerKind`、`hostPatterns`、`pathPrefixes`、`models`。

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Generate clients | `pnpm gen:cli` | generated SDK/CLI reflects the new GET route |
| Server tests | `pnpm --filter @cradle/server exec vitest run src/modules/provider-catalog/catalog.test.ts tests/provider-catalog.test.ts --maxWorkers=1` | existing registry tests and the new route contract test pass |
| Web tests | `pnpm --filter @cradle/web exec vitest run src/features/agent-management` | matcher/catalog tests pass |
| Server typecheck | `pnpm --filter @cradle/server typecheck` | exit 0 |
| Web typecheck | `pnpm --filter @cradle/web typecheck` | exit 0 |
| Scoped lint | `pnpm exec eslint apps/server/src/modules/provider-catalog apps/web/src/features/agent-management` | exit 0 |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Provider Catalog public endpoint-template DTO and authenticated GET route
- Server registry safe projection
- generated SDK/CLI artifacts required by the route
- Agent Management feature gateway/query and pure local matcher
- Import Provider detection and custom-model bootstrap
- focused Server route/registry and Web pure tests
- Provider Catalog and Agent Management ownership documentation

**Out of scope**:

- changing credential storage or Anthropic wire-auth behavior
- model inventory/enrichment/visibility redesign from Plan 035
- target-scoped refresh/query work from Plan 045
- adding arbitrary user-editable endpoint templates
- polling, SSE, or fetching on every endpoint input change
- component/browser tests for the dialog

## Git workflow

- Branch: `advisor/048-publish-provider-endpoint-catalog`
- Suggested commit: `refactor(provider-catalog): publish safe endpoint templates`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Characterize canonical matching and safe fields

Extend focused Server tests first. Cover exact/subdomain hostname matching, path-prefix boundary, provider-kind mismatch, invalid URL, DeepSeek/Xiaomi, and Volcengine. Add a projection assertion that recursively rejects `anthropicWireAuth` and any future runtime-only field from the public result.

The safe projection must be an explicit mapper, not object spread followed by deletion. Define the public field allowlist in the TypeBox response schema so OpenAPI and runtime output agree.

**Verify**: registry tests pass; new route test fails before the route/projection exists.

### Step 2: Publish the Server-owned projection

Add a Provider Catalog service function that maps canonical templates to immutable public DTOs. Add an authenticated `GET /providers/endpoints` route under the existing `providers` module, with `ProvidersModel` owning the response schema and `x-cradle-cli` metadata following existing naming conventions.

Keep `anthropicWireAuth` and `resolveAnthropicWireAuth` internal. Do not split a second public registry or move runtime policy into the route model.

**Verify**: route returns all three current templates including Volcengine; serialized JSON contains no `anthropicWireAuth`; Server typecheck passes.

### Step 3: Regenerate transport clients

Run the repository generator and inspect the generated operation name and DTO. Commit only expected generated changes. Do not hand-write fetch or duplicate the response type in Web code.

**Verify**: generated SDK exposes the endpoint operation with the exact safe DTO; generation is stable on a second run.

### Step 4: Build the Agent Management catalog gateway

Replace the hard-coded Web registry with a feature-owned gateway that consumes the generated operation through TanStack Query. Use a stable feature query key and `staleTime: Infinity`: the catalog is process-static, so one load per app process/dialog lifecycle is sufficient.

Extract a pure matcher over the fetched DTO. It must use URL parsing, hostname boundary matching, normalized path-prefix boundary matching, and provider-kind filtering. The import dialog may recompute this matcher synchronously for each input change, but must not trigger a network request per keystroke.

Define loading/failure behavior explicitly: importing remains possible without detection; no template means no automatic custom-model patch and no detection hint. Do not silently fall back to a bundled mirror, which would recreate drift.

**Verify**: pure tests cover host/path/kind matrix and invalid URLs; query fetches once for repeated matcher calls.

### Step 5: Migrate Import Provider consumers

Make both dialog call sites consume the same loaded catalog and pure matcher. Pass the selected provider kind for non-universal providers. For universal imports, match each endpoint against its corresponding protocol rather than using only the OpenAI URL as a proxy.

Preserve current import ordering: create secret/profile first, then best-effort custom-model bootstrap and cache warm. Detection must use the same matched template for hint text and bootstrap so UI promise and persisted models cannot diverge.

**Verify**: helper-level tests show Volcengine `/api/coding` matches only Anthropic and bootstraps `glm-5.2`; an adjacent path and OpenAI kind do not match.

### Step 6: Delete the mirror and document ownership

Delete the Web template constants. Keep only the safe DTO matcher/query in Agent Management. Update Provider Catalog README with canonical/private/public field boundaries and Agent Management docs with cache/failure behavior.

**Verify**: `rg -n "PROVIDER_ENDPOINT_TEMPLATES|anthropicWireAuth" apps/web/src` has no matches; runtime-only policy remains in Server registry/catalog only. Run all commands above.

## Test plan

- Server registry: hostname/subdomain, path boundary, kind filter, invalid URL, runtime auth.
- Server route: complete public catalog, stable safe DTO, runtime field non-disclosure.
- Web matcher: identical host/path/kind semantics over DTOs; invalid URL and empty catalog.
- Import projection helper: detected hint and custom-model bootstrap derive from one match, including universal endpoints.
- Query behavior: one cached catalog read, explicit non-blocking failure behavior.
- No dialog component or browser test.

## Done criteria

- [ ] Server registry is the only endpoint-template source of truth.
- [ ] `GET /providers/endpoints` exposes only the six approved public fields.
- [ ] `anthropicWireAuth` never appears in public DTOs, OpenAPI, generated Web types, or Web source.
- [ ] Web matching respects hostname boundary, path prefix, and provider kind.
- [ ] Import detection and model bootstrap consume one matched projection.
- [ ] Catalog is cached without per-keystroke requests; failure does not block manual import.
- [ ] Web hard-coded registry is deleted.
- [ ] focused tests, generation, typechecks, lint, and diff check pass.
- [ ] ownership docs and `plans/README.md` are updated.

## STOP conditions

- Public UI behavior requires `anthropicWireAuth` or another credential policy; stop and design a separate non-secret capability contract.
- Endpoint templates must become user-editable or hot-reloadable; stop because `staleTime: Infinity` and process-static ownership no longer hold.
- Plan 035 or concurrent work has changed Provider Catalog DTO/model ownership; reconcile before adding a parallel schema.
- Generated SDK cannot represent the GET response without a hand-written cast/fetch; stop and fix generation at its owner.
- Any implementation proposes a bundled Web fallback registry or network request per keystroke.
- Any verification fails twice for the same reason.

## Maintenance notes

- Add future templates only to the Server registry and extend the safe projection tests.
- Treat public DTO additions as an API review; never spread internal template records into responses.
- Plan 045 executes after this plan so overlapping Provider Catalog route/model/docs changes land once.
