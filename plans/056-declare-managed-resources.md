# Plan 056：建立声明式 Managed Resource Catalog 与统一资源页

> **Executor instructions**: Follow this plan milestone by milestone. Run every
> verification command and confirm the expected result before moving to the
> next milestone. If anything in the "STOP conditions" section occurs, stop and
> report — do not infer resource identity, turn Download Center into an
> installer, or move owner lifecycle into the catalog. When done, update this
> plan's status row in `plans/README.md` unless a reviewer explicitly owns the
> index.
>
> **Drift check (run first)**:
> `git diff --stat 3dca102..HEAD -- apps/server/src/app.ts apps/server/src/modules/chronicle apps/server/src/modules/download-center apps/server/src/modules/managed-resources apps/server/tests apps/web/src/api-gen apps/web/src/components/layout apps/web/src/features/download-center apps/web/src/features/managed-resources apps/web/src/locales apps/web/src/navigation apps/web/src/routes packages/cli/src/commands/generated packages/download-center plans/README.md`
> If an in-scope path changed, compare the "Current state" excerpts against live
> code before proceeding; semantic drift in Download Center ownership,
> Chronicle model manifests, Server composition, or Web surface routing is a
> STOP condition. Also run
> `git status --short -- apps/server/src/app.ts apps/server/src/modules/chronicle apps/server/src/modules/download-center apps/web/src/api-gen apps/web/src/components/layout apps/web/src/features/download-center apps/web/src/locales apps/web/src/navigation apps/web/src/routes packages/cli/src/commands/generated`.
> At planning time several of these paths had unrelated uncommitted work. Do not
> execute this plan in an overlapping dirty worktree; start from a clean
> worktree after the operator has committed or otherwise reconciled them.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/047-build-unified-download-center.md` (implementation landed in commit `3fad235`; reconcile its stale TODO index row before execution)
- **Category**: direction, architecture, ux, security
- **Planned at**: commit `3dca102`, 2026-07-15
- **Executed**: DONE on 2026-07-16

Execution note: the Server catalog, Chronicle adapter, exact logical transfer
identity, generated HTTP/CLI clients, lazy Resources surface, transfer filters,
owner-scoped progress, localized chrome, and owner-return navigation are
implemented. Focused Server/Web suites, all three typechecks, Server/Web
boundary checks, production Web build, scoped Resources/Download Center locale
validation, scoped ESLint, and diff hygiene pass. The repository-wide i18n gate
remains blocked by pre-existing unrelated locale debt (251 missing keys, two
plural entries, and 15 hardcoded-text findings); the `resources` and `chrome`
namespaces have zero missing, extra, or invalid entries.

## Why this matters

Cradle currently learns that a downloadable thing exists only when an owner
calls `DownloadCenter.execute()`. Before that moment there is no shared
declaration, so the compact Download Center popover can show active and recent
byte-transfer tasks but cannot answer basic resource questions: what Cradle can
install, what is installed, what version is current, whether an update exists,
or what can be removed.

The missing layer is not a larger download history. It is a declarative Managed
Resource Catalog. Owners declare stable resource identities and project their
own installation truth through small adapters. A new Resources page renders
that inventory and dispatches explicit install/update/uninstall commands back
to the owner. Download Center remains thin transfer infrastructure and the page
joins its live tasks to declarations by an exact shared identity.

After this plan:

- resources exist in the catalog before the user downloads them;
- a real `/resources` page has a **Resources** view for inventory/actions and a
  **Transfers** view for Server/Desktop task progress and bounded history;
- Chronicle model manifests are the first adapter and remain Chronicle-owned;
- Plan 057 can add OpenCode CLI as another adapter without adding another
  Settings-only installer surface;
- Download Center still owns bytes, verification, retry/resume, cancellation,
  and redacted transfer history, but not installation truth or resource
  lifecycle.

## Architecture decisions

1. **The catalog owns declaration, projection, lookup, and command dispatch.**
   It does not download, extract, promote, activate, uninstall, roll back, or
   persist owner state.
2. **Each owner retains semantics and lifecycle.** Chronicle continues to own
   model manifests, local-file verification, storage, database projection,
   install single-flight, promotion, and removal. Future OpenCode continues to
   own release compatibility, archive handling, executable selection, process
   leases, and managed storage.
3. **Download Center remains a transfer service.** Do not add resources,
   installed versions, actions, arbitrary enqueue, destinations, or artifact
   paths to its public contract.
4. **Identity is exact, never inferred.** A managed resource and every transfer
   belonging to it use the same `(namespace, resourceType, resourceId)` triple.
   The Web must not join by display name, file name, URL, time proximity, prefix
   matching, or owner-specific heuristics.
5. **Declaration and state projection are separate.** The catalog registers
   trusted declarations synchronously at composition/boot, then asks the owner
   for dynamic state. A state read failure can project `error`; it must not make
   the declared resource disappear.
6. **The catalog is an in-memory registry of owner adapters, not a database.**
   Resource declarations come from trusted built-in code and owner manifests;
   current state is read from the owner. Do not create a second source of truth
   or a generic installation table.
7. **The renderer sends only resource keys and verbs.** URLs, checksums,
   versions, archive names, local paths, headers, and installation options stay
   behind trusted owner adapters.
8. **The page is a projection, not a new owner.** It may merge catalog entries
   with Download Center tasks for presentation, then invalidate/refetch owner
   projections after commands or terminal transfer events.

## Current state

### Download Center identity appears only at execution time

`packages/download-center/src/contract.ts:3-27` defines `DownloadOwner` and
requires it inside `DownloadRequest`:

```ts
export interface DownloadOwner {
  namespace: string
  resourceType: string
  resourceId: string
  displayName: string
}

export interface DownloadRequest {
  owner: DownloadOwner
  fileName: string
  sources: readonly DownloadSource[]
  integrity?: DownloadIntegrity
  maxBytes: number
  maxAttempts?: number
}
```

No pre-execution declaration API exists. Server public routes under
`/download-center` list/get/cancel/subscribe to redacted tasks only. Trusted
owners call `execute`, `retry`, `findLatestRetryable`, and `release` internally.
Completed artifacts are copied/promoted by the owner and released, so task
history cannot be used as installed-resource truth.

`apps/web/src/features/download-center/download-center-chrome.tsx` is a compact
header popover. It renders active tasks and `recent.slice(0, 5)` and has no link
to a full route. `use-download-center.ts` already merges Server and Desktop task
streams and exposes all tasks present in the hosts' bounded snapshots.

### Chronicle already declares resources, but only inside Chronicle

`apps/server/src/modules/chronicle/service.ts:1119-1263` contains six built-in
model manifests (`ocr`, `audio-vad`, `audio-asr`, `speaker`, `embedding`, and
`pii`) with stable categories, labels, versions, required flags, files,
integrity, and feature metadata.

`getModelResources`, `verifyModelResource`, `installModelResource`, and
`removeModelResource` already own status and lifecycle. Chronicle currently
uses `available` for a verified ready resource (including a successfully
installed file-backed resource), `missing` for absent required files, and
`installing`/`error` during operations; the declared `installed` vocabulary is
not written by the current install path. HTTP routes under
`/chronicle/model-resources` expose list/reconcile/install/verify/remove. The
catalog must adapt these APIs rather than replace them or duplicate their
Drizzle state.

The current transfer owner is too granular:

```ts
function modelResourceDownloadOwner(category, file) {
  return {
    namespace: 'chronicle',
    resourceType: 'model-resource-file',
    resourceId: `${category}:${file.path}`,
    displayName: `${getModelResourceManifest(category).displayName}: ${file.path}`,
  }
}
```

That identity is created only while installing and describes a file rather than
the declared logical resource. Plan 056 changes all files in one Chronicle
resource to the logical key `{ namespace: 'chronicle', resourceType:
'model-resource', resourceId: category }`. Multiple transfer tasks may share a
resource key; `fileName` and `taskId` still distinguish the byte transfers.

### Web routes are surface-aware

File routes live under `apps/web/src/routes/`. App navigation also requires a
matching `SurfaceKind`, `SurfaceRoute`, route decoder, persisted Zod schema, and
command in `apps/web/src/navigation/`. `/usage` is the nearest standalone-page
example. The new `/resources` route must participate in this system instead of
calling the router ad hoc.

All UI follows the repository design system, uses static Tailwind classes and
`cn()`, and places feature-specific components under a domain folder. Generated
Web/CLI clients follow Elysia route changes; they are never hand-edited.

## Target contract

### Shared identity and descriptor

Reuse Download Center's owner identity structurally; do not invent a parallel
ID encoding:

```ts
type ManagedResourceKey = Pick<
  DownloadOwner,
  'namespace' | 'resourceType' | 'resourceId'
>

type ManagedResourceState =
  | 'not-installed'
  | 'installing'
  | 'installed'
  | 'update-available'
  | 'error'
  | 'unavailable'

interface ManagedResourceAction {
  available: boolean
  reasonCode: string | null
}

interface ManagedResourceDescriptor {
  key: ManagedResourceKey
  displayName: string
  description: string | null
  kind: string
  required: boolean
  state: ManagedResourceState
  installationSource: 'built-in' | 'managed' | 'external' | null
  installedVersion: string | null
  availableVersion: string | null
  installedSizeBytes: number | null
  downloadSizeBytes: number | null
  actions: {
    install: ManagedResourceAction
    update: ManagedResourceAction
    uninstall: ManagedResourceAction
  }
}
```

The public descriptor is deliberately small and redacted. `installationSource`
is an ownership classification, not a path/provider/release detail: it lets the
UI distinguish bundled capability, Cradle-owned files, and operator-owned
external installations without promising that Cradle can remove the latter.
The descriptor contains no URL, checksum, header, path, raw manifest, arbitrary
metadata bag, or raw owner error. `reasonCode` is a stable safe localization
code suitable for disabled-action UX, not a serialized exception. `kind` is
presentation grouping, not command dispatch; dispatch always uses the full key.

Built-in/no-download resources such as Chronicle macOS Vision OCR project as
`installed` with zero bytes and no install/uninstall action. A resource known
to Cradle but impossible on the current host projects as `unavailable` instead
of disappearing. If an owner adapter fails while projecting dynamic state, the
declaration remains visible as `error`, all actions are disabled, and the
adapter must not fabricate an installed state.

### Owner adapter and registry

Create a Server-owned `modules/managed-resources` deep module. Split immutable
declaration metadata from dynamic owner state:

```ts
type ManagedResourceDeclaration = Pick<
  ManagedResourceDescriptor,
  'key' | 'displayName' | 'description' | 'kind' | 'required'
>

type ManagedResourceProjection = Pick<
  ManagedResourceDescriptor,
  | 'state'
  | 'installationSource'
  | 'installedVersion'
  | 'availableVersion'
  | 'installedSizeBytes'
  | 'downloadSizeBytes'
  | 'actions'
>

interface ManagedResourceAdapter {
  readonly namespace: string
  declarations(): readonly ManagedResourceDeclaration[]
  project(key: ManagedResourceKey): Promise<ManagedResourceProjection>
  execute(
    key: ManagedResourceKey,
    action: 'install' | 'update' | 'uninstall',
  ): Promise<ManagedResourceProjection>
}
```

The exact signatures may use a typed command enum or a resource-scoped owner
handle if that produces a deeper module, but these invariants are mandatory:

- adapters are registered explicitly in `app.ts`/contract composition and
  declarations are snapshotted/validated before routes accept requests;
- namespace ownership is unique and duplicate resource keys fail at boot or
  deterministic contract construction;
- the registry validates that declared keys use the adapter namespace and are
  unique; declaration metadata cannot change during the process lifetime;
- command lookup resolves an exact declared key, checks the projected action,
  and calls only that adapter;
- adapters accept no renderer-provided installation data;
- missing keys return a stable 404, disabled actions a stable 409, adapter
  failures use `AppError` mapping, and no raw error crosses HTTP; a projection
  failure returns the still-declared resource as `error` with actions disabled
  and a stable safe reason code;
- the registry has no dependency on Web or owner implementation internals;
- Download Center does not depend on the registry, avoiding a lifecycle cycle.

Use one shared helper/type for converting a descriptor key into a
`DownloadOwner`; owners supply only the trusted display name. Add contract tests
that compare all key fields exactly. Do not enforce declaration by teaching
Download Center about resources because legitimate transfers such as Desktop
updates are not retained managed resources.

### HTTP and CLI surface

Expose authenticated Server routes:

| Method | Route | CLI command | Semantics |
| --- | --- | --- | --- |
| GET | `/managed-resources` | `managed-resources list` | List all declared redacted descriptors |
| GET | `/managed-resources/:namespace/:resourceType/:resourceId` | `managed-resources get` | Read one exact descriptor |
| POST | `/managed-resources/:namespace/:resourceType/:resourceId/install` | `managed-resources install` | Dispatch trusted install with no body |
| POST | `/managed-resources/:namespace/:resourceType/:resourceId/update` | `managed-resources update` | Dispatch trusted update with no body |
| DELETE | `/managed-resources/:namespace/:resourceType/:resourceId` | `managed-resources uninstall` | Dispatch trusted uninstall with no body |

Route params are identifiers only. Reject extra bodies. The catalog returns the
post-command descriptor, while the Web also refetches the list because sibling
state may change. Existing Chronicle owner routes remain available for
owner-specific reconcile, verify, local-file install, and install-all semantics;
the generic catalog exposes only safe manifest install/update/uninstall.

### Unified Resources page

Add a lazy `/resources` route and surface identity. The page has two stable
views:

1. **Resources** — declared cards/rows grouped by `kind`, showing name,
   description, required/optional label, state, installed/available version,
   size, exact active transfer progress, and only server-authorized actions.
2. **Transfers** — the full bounded Server/Desktop Download Center projection,
   with active-first/status/scope/owner filters, cancel for active tasks, and
   terminal status/error history. It does not offer generic retry or install;
   retry returns to the matching resource action when the key is declared.

Join logic compares the three identity fields exactly. If multiple active tasks
belong to one resource, show aggregate bytes only when every task has a known
total; otherwise show indeterminate aggregate progress plus per-file detail on
expansion. Terminal transfer failure may annotate the resource row, but the
owner descriptor remains authoritative for installation state.

The existing header popover stays compact and gains one footer action that opens
the Resources surface on its default Resources view; the user can switch to the
Transfers view inside the page. Add `openResources()` to navigation commands
and the matching surface codec/persistence entries. Do not put this inventory
inside Chat Settings or Chronicle Settings.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Generate Web API | `pnpm generate:web` | managed-resource list/get/actions appear in generated clients |
| Generate CLI | `pnpm gen:cli` | generated `managed-resources` list/get/install/update/uninstall commands exist |
| Server focused tests | `pnpm --filter @cradle/server exec vitest run src/modules/managed-resources/service.test.ts tests/managed-resources.test.ts src/modules/chronicle/service.test.ts tests/download-center.test.ts` | selected tests pass without real network/files outside temp roots |
| Web focused tests | `pnpm --filter @cradle/web exec vitest run --config vite.config.ts --environment jsdom src/features/managed-resources/managed-resources-page.test.tsx src/features/managed-resources/projection.test.ts src/features/download-center/download-center-chrome.test.tsx src/navigation/surface-identity.test.ts` | inventory/actions/transfers/navigation cases pass |
| Server typecheck/boundaries | `pnpm --filter @cradle/server typecheck` | exit 0, including boundary validation |
| Web typecheck/API boundary | `pnpm --filter @cradle/web typecheck` | exit 0 |
| CLI typecheck | `pnpm --filter @cradle/cli typecheck` | exit 0 |
| i18n validation | `pnpm --filter @cradle/web i18n:ci` | exit 0 for all existing locales |
| Scoped lint | `pnpm exec eslint apps/server/src/app.ts apps/server/src/modules/managed-resources apps/server/src/modules/chronicle apps/server/tests/managed-resources.test.ts apps/web/src/components/layout/app-header.tsx apps/web/src/features/download-center apps/web/src/features/managed-resources apps/web/src/navigation apps/web/src/routes/resources.tsx` | exit 0 for plan-owned sources |
| Diff hygiene | `git diff --check` | no output, exit 0 |

Do not use a real download for verification. Chronicle adapter tests inject its
existing fake Download Center/temp storage seams. No browser test is required.

## Suggested executor toolkit

- Use `server-app-development` for the Elysia module, TypeBox schemas, OpenAPI
  metadata, lifecycle composition, module README, and generated CLI contract.
- Use `codebase-design` to keep the registry deep and prevent owner lifecycle
  from leaking into a generic installer.
- Use `vercel-react-best-practices` for generated-client queries, targeted
  invalidation, and isolating high-frequency transfer rendering.
- Use `make-interfaces-feel-better` for resource/transfer states while keeping
  existing design-system primitives and restrained transitions.

## Scope

### In scope

- New `apps/server/src/modules/managed-resources/{index.ts,model.ts,service.ts,README.md}` and focused tests.
- `apps/server/src/app.ts` composition of one registry and the Chronicle adapter.
- Minimal Chronicle adapter/helper files within `apps/server/src/modules/chronicle/`.
- Chronicle logical resource Download Owner migration and characterization tests.
- New Server HTTP contract test and generated Web/CLI clients.
- New `apps/web/src/features/managed-resources/` page, projection helpers, and focused tests.
- New `apps/web/src/routes/resources.tsx` and required surface identity/store/navigation updates.
- Header Download Center footer link and compact owner retry routing to a declared resource.
- Resource/chrome locale keys in the default catalog and every supported locale.
- Module/capability README updates explaining the catalog/Download Center/owner split.
- `plans/README.md` status/dependency notes.

### Out of scope

- OpenCode installation implementation; Plan 057 adds that adapter after this plan.
- Migrating Plugins, ACP binaries, skills, browser assets, or Desktop updates into
  the resource catalog. Classify their retained-resource semantics first.
- Treating Desktop application updates as installed managed resources. They
  remain transfers on the Transfers view.
- A generic enqueue/retry URL, destination, checksum, version, local-file, or
  archive API.
- Moving Chronicle manifests, storage, database rows, install logic, or remove
  logic into `managed-resources`.
- A managed-resource database table, event log, scheduler, auto-update polling,
  or background install.
- Automatically installing a resource when selected or first needed.
- Removing existing owner-specific Chronicle routes.
- Browser E2E tests or component tests outside the critical projection/action
  path.

## Git workflow

- Branch/worktree: `advisor/056-declare-managed-resources` from a clean base
  after current overlapping work is committed/reconciled.
- Suggested commits:
  - `feat(server): declare managed resource catalog`
  - `refactor(chronicle): expose model resources through catalog`
  - `feat(web): add unified resources and transfers page`
- Keep generated API/CLI changes with their route contract or in an immediately
  following generated-artifact commit.
- Do not push, open a PR, merge, or modify the operator's dirty branch unless
  explicitly instructed.

## Milestones

### Milestone 0: Characterize identity and owner truth

1. Lock Download Center's current read/cancel/events-only public contract and
   internal `execute/retry/findLatestRetryable/release` boundary with existing
   tests.
2. Add focused Chronicle characterization for all declared categories, built-in
   no-file OCR, missing/installed/error states, manifest install, remove, and
   multi-file transfer ownership.
3. Record the current file-level owner keys in a test that will be intentionally
   replaced in Milestone 2; do not keep a compatibility alias.
4. Confirm `/resources` is unused and enumerate every required navigation codec
   location before editing generated route state.

### Milestone 1: Build the catalog as a deep Server module

1. Define TypeBox public schemas separately from adapter/service types.
2. Implement explicit adapter registration, deterministic list ordering, exact
   key lookup, duplicate namespace/key validation, action authorization, and
   safe AppError mapping.
3. Add list/get/install/update/uninstall routes with no command bodies and
   `x-cradle-cli` metadata.
4. Document ownership, trust boundary, identity invariant, error/redaction
   contract, and why the module has no database or Download Center dependency.
5. Test duplicate/mismatched declarations, unknown keys, disabled actions,
   adapter failures, redaction, and exact dispatch.

### Milestone 2: Adapt Chronicle without moving its lifecycle

1. Add a Chronicle-owned adapter that maps every built-in manifest category to
   a descriptor before installation.
2. Map Chronicle status deterministically; document the exact table in the
   adapter test. `available` and legacy `installed` both become catalog
   `installed`; `missing` becomes `not-installed`; `installing` and `error`
   retain their meanings. The adapter uses manifest/file verification already
   encoded by Chronicle and does not infer readiness from `path` or size. If the
   live Chronicle status vocabulary differs, stop and update this table
   explicitly rather than guessing.
3. Derive action availability from manifest/owner capabilities. Catalog install
   invokes manifest install only; it never exposes local-file/source-root input.
   Update is unavailable until Chronicle has an actual newer manifest/version
   semantic. Uninstall delegates to `removeModelResource` only when owner rules
   permit it.
4. Change `modelResourceDownloadOwner` to the logical catalog key. All files of
   `audio-asr`, `embedding`, and `pii` share their category key while retaining
   distinct task/file/source IDs.
5. Compose the adapter explicitly into one registry in `app.ts`; keep contract
   construction injectable for tests and avoid module-global state.
6. Run Chronicle, catalog, Download Center, typecheck, and boundary tests before
   generating clients.

### Milestone 3: Add generated contracts and the Resources surface

1. Generate Web and CLI clients after Server contract tests pass.
2. Add the lazy `/resources` file route and `managed-resources` feature folder.
3. Extend `SurfaceKind`, `SurfaceRoute`, route decoding, persisted Zod schema,
   route/layout identity, and navigation commands with a stable `resources`
   surface. Update navigation codec tests; do not hand-edit routeTree output
   except through the repository generator.
4. Build a generated-client query for descriptors and mutations keyed by the
   exact resource triple. Invalidate the catalog after command completion and
   terminal owner-task changes, not on every progress byte.
5. Implement pure tested projection helpers for exact resource/task join,
   aggregate progress, filtering, and ordering. Keep them outside the page JSX.

### Milestone 4: Build inventory and transfer management UI

1. Implement Resources and Transfers views with existing cards, buttons,
   progress, tabs, badges, empty/error/loading states, typography, and static
   Tailwind classes combined with `cn()`.
2. Resources render before any download exists and actions reflect only Server
   capabilities. Disable an action during its mutation and relevant active
   tasks; never optimistically claim installation.
3. Transfers render both Server and Desktop tasks from the existing projection,
   provide status/scope/owner filters, active cancellation, and bounded history.
4. Failed managed-resource transfers link to the exact resource row/action.
   Unknown/non-resource transfers remain visible without fabricated resource
   actions.
5. Keep high-frequency progress subscriptions inside memoized resource/transfer
   rows so unrelated chrome and the whole inventory do not rerender per chunk.
6. Add the popover footer link and all locale keys. Preserve the popover's
   compact five-recent-task behavior.

### Milestone 5: Close docs, generation, and regression gates

1. Update Download Center README to point to the catalog for declarations while
   retaining its thin transfer ownership. Update Chronicle/catalog READMEs and
   relevant capability docs.
2. Run generators, focused suites, all typechecks, boundary/API checks, i18n,
   scoped lint, and diff hygiene from the command table.
3. Inspect `git diff --name-status` and confirm there is no DB migration,
   Desktop IPC mutation, source URL/path in schemas, generic enqueue route, or
   owner lifecycle moved into the catalog.
4. Update Plan 047's row only if its existing execution has been independently
   reconciled. Update Plan 056 to DONE only after every criterion below passes.

## Test plan

### Catalog unit/HTTP tests

- empty registry and deterministic multi-adapter ordering;
- duplicate namespace, duplicate exact key, and adapter/key namespace mismatch;
- exact get/dispatch and no prefix/case/fuzzy fallback;
- unknown resource, unavailable action, and in-flight conflict status codes;
- no-body command validation and authenticated route behavior;
- adapter failure redaction and absence of URL/checksum/path/header fields;
- OpenAPI metadata and generated CLI command shape.

### Chronicle adapter tests

- every manifest appears before any download;
- deterministic state/version/size/action mapping including fileless OCR;
- manifest-only install command, remove delegation, and unavailable update;
- one exact logical owner key across every file task in a multi-file resource;
- existing install single-flight, staging, verification, promotion, release, and
  failure cleanup remain green.

### Web tests

- loading/error/empty inventory and pre-download declarations;
- grouping, states, versions, sizes, required flag, disabled reasons, and actions;
- exact triple join rejects near-matching resource IDs;
- known-total, unknown-total, multi-file, terminal failure, and cancel progress;
- Server/Desktop transfer filters and unknown-owner history;
- mutation convergence and terminal-only invalidation;
- `/resources` surface creation, persistence, route decode, and popover link.

## Done criteria

- [ ] Every Chronicle model resource is visible before a download begins.
- [ ] Resource identity and related Download Center task identity match exactly
  on namespace/resourceType/resourceId; no heuristic join exists.
- [ ] The catalog owns only declaration/projection/dispatch and has no install
  storage, download execution, DB table, or owner lifecycle logic.
- [ ] Chronicle remains authoritative for manifests, state, install, verify,
  promotion, removal, and storage.
- [ ] Public resource schemas and commands expose no URL, checksum, header,
  absolute path, staging path, raw manifest, or raw owner error.
- [ ] `/resources` provides declared Resources plus Server/Desktop Transfers;
  the header popover links to it and stays compact.
- [ ] Install/update/uninstall are explicit authenticated owner dispatches with
  no caller-supplied version/source/path/body.
- [ ] Existing Download Center public/internal boundaries and transfer tests pass.
- [ ] Generated Web/CLI clients are current and all focused tests pass.
- [ ] Server, Web, and CLI typechecks; boundaries; API boundary; i18n; scoped
  lint; and `git diff --check` pass.
- [ ] No DB migration, browser test, Desktop resource registry, generic enqueue,
  or unrelated source change is included.
- [ ] `plans/README.md` Plan 056 row is DONE only after all criteria are verified.

## STOP conditions

Stop and report instead of improvising if:

- a clean worktree cannot be obtained for overlapping Server composition,
  Chronicle, Web navigation, generated client, locale, or Download Center files;
- Plan 047's live Download Center no longer has the documented thin internal
  execution and redacted public projection boundary;
- an owner cannot declare a stable exact resource key before download;
- a proposed implementation needs display-name/file-name/time/prefix matching;
- catalog command dispatch requires a renderer URL, checksum, version, source,
  path, archive option, or arbitrary metadata;
- correct state requires copying owner truth into a new generic DB table;
- module boundaries require Download Center to depend on Managed Resources or
  create a cycle among the catalog, Chronicle, and transfer host;
- Chronicle state/action mapping is ambiguous. Document and review the mapping;
  do not use a heuristic;
- a resource command must kill an active runtime or remove externally owned
  files; the relevant owner must define lease/ownership semantics first;
- Web navigation cannot add `/resources` losslessly through the existing
  surface codec without broader navigation redesign;
- a verification command fails twice after a reasonable plan-scoped fix, or
  the required fix expands beyond declared scope.

## Maintenance notes

- A new owner participates by registering an adapter and using its exact
  resource key for related Download Center tasks. It must not add another
  parallel inventory page as the primary management surface.
- Adding an adapter is an ownership review, not a mechanical wrapper. Confirm
  declaration timing, installed truth, update semantics, uninstall ownership,
  activation/leases, and secure command inputs first.
- Plugins, ACP, and Desktop Update are intentionally deferred because “was
  downloaded” does not prove “is a retained managed resource.”
- Plan 057 is the next consumer: OpenCode declares one optional CLI resource,
  uses the catalog commands/page, and keeps its archive/install/runtime
  semantics in the OpenCode owner.
