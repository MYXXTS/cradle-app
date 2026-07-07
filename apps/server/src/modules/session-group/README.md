# Session Group Module

Session Group owns workspace-scoped containers that organize multiple chat sessions into one work package. Groups are lightweight metadata containers; chat execution remains session-owned.

- Groups must belong to exactly one workspace.
- Sessions may belong to at most one group via `sessions.sessionGroupId`.
- Deleting a group unbinds member sessions without deleting them.
- Optional `linkedIssueId` links a group to an issue; issue-driven creation flows are out of scope for v1.
- `configJson` is reserved for future group-level shared context; v1 does not inject it into agent prompts.

## Files

- **index.ts**: HTTP routes for CRUD, member add/remove, and CLI metadata.
- **model.ts**: TypeBox schemas for session group requests and responses.
- **service.ts**: Group semantics, workspace invariants, member assignment, and aggregate status projection.
