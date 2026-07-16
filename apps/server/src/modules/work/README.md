# Work module

The Work module owns the local outcome container: its objective, primary-thread
membership, prepared handoff metadata, archive fact, and composition of existing
Session, Worktree, Pull Request, Chat Runtime, and Await read models.

## Invariants

- A Session belongs to at most one Work.
- A Work has exactly one primary Session in the local v1 flow.
- Work creation requires a local Git workspace and an immediately active
  managed Worktree.
- Default creation bases the managed Worktree on a clean local `HEAD`
  (`baseStrategy: source-head`). When the source checkout is dirty, clients may
  explicitly opt into `baseStrategy: remote-default` to start from the remote
  tracking default branch tip (for example `origin/main`) without touching local
  WIP.
- Work stores facts only. Activity labels are derived and no Work status machine
  exists.
- Preparing a handoff never pushes or calls GitHub.
- The builtin `cradle` MCP server exposes `work_prepare` as the required
  Agent-facing finalization tool; the tool delegates to this module's prepare
  API and does not own Work persistence.
- Work contributes one deterministic `<cradle_work_state>` harness fragment for
  its primary Session. The fragment contains only the Work id and
  `thread_role: primary`; Work lifecycle instructions come from the permanently
  resident `cradle-cli` skill. The objective already enters the transcript as
  the initial user message, while pull-request, Await, and Worktree state remain
  available through their owning modules, delivered events, and on-demand reads.
- Creating or updating a Draft PR requires an explicit submit request.
- Mark Ready and merge remain user-controlled outside this module.

## Ownership boundaries

- Session owns conversation metadata and archive behavior.
- Work API read models project the primary Session title; the persisted creation title
  is only the initial worktree slug seed and is never a second mutable title.
- Worktree owns Git checkout creation, binding, health, and cleanup.
- Pull Request owns Git comparison, push, GitHub API calls, and PR persistence.
- Chat Runtime owns runs and pending interaction state.
- Session Await owns external waiting facts.

Work reads and composes those services but does not duplicate their semantics.

## Files

- `index.ts`: HTTP/OpenAPI/CLI routes.
- `agent-context.ts`: Work-owned primary-Session harness fragment registration.
- `model.ts`: TypeBox request and response schemas.
- `service.ts`: Work persistence, aggregate reads, compensated creation,
  preparation, and explicit delivery orchestration.
- `service.test.ts`: critical Work invariants and delivery-control tests.
