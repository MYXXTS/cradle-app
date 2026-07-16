# External Session Import Module

Cradle-owned import boundary for provider-owned Claude and Codex chat sessions.

The module reads external provider namespaces without modifying them. Discovery returns lightweight descriptors and historical Workspace recovery plans; transcript bodies remain server-side and are read only for selected candidates. Claude discovery uses the official Claude Agent SDK in an isolated child process so Cradle's runtime-owned `CLAUDE_CONFIG_DIR` cannot redirect or race external discovery. Main sessions and SubAgents retain their native distinction. Codex discovery streams current and archived rollout files and excludes SubAgent rollouts from the top-level catalog.

Workspace identity and recovery remain owned by the Workspace module. Session creation remains owned by the Session module, and imported chat event projection remains owned by Chat Runtime. This module orchestrates those interfaces and owns source identity, revision, fidelity, import status, and synchronization semantics.

## Files

- **index.ts**: Elysia `/external-session-import` routes and generated CLI metadata.
- **model.ts**: TypeBox HTTP schemas for scans, candidates, Workspace plans, and import results.
- **catalog.ts**: Short-lived source catalog, parallel adapter discovery, duplicate projection, and Workspace planning.
- **types.ts**: Internal source adapter interface and normalized descriptor/message contracts.
- **source-utils.ts**: Stable source identity, revisions, content hashes, and normalized message helpers.
- **sources/claude.ts**: Official Claude Agent SDK adapter.
- **sources/claude-source-worker.ts**: Isolated SDK filesystem reader with user-owned Claude config semantics.
- **sources/codex.ts**: Read-only streaming Codex rollout adapter.

Scan records are intentionally short-lived and contain no transcript payloads. Import requests reference candidate IDs from a scan, and the server revalidates source revision before reading a transcript.

Synchronization stores a per-message source checkpoint. A later provider history is appendable only when the imported checkpoint remains an exact stable prefix; rewritten or shortened history is marked divergent instead of being merged heuristically. Legacy `external_work_import_items` session records are read only for adoption: selecting a matching full source repairs its Workspace and preserves its existing Cradle Session while the new module becomes the durable import owner.
