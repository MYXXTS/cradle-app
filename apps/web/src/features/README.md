# features

Domain-specific feature modules.
Each subdirectory owns a business domain.
Components, hooks, and utilities specific to a feature live together.

Server-owned business state must enter a feature through `features/<domain>/api/`.
That gateway owns generated-client imports, query keys, response-envelope decoding,
runtime validation, throwing HTTP semantics, cancellation, and invalidation helpers.
Generated code under `src/api-gen/` is transport infrastructure, not a public API for
feature components or hooks. Zustand remains limited to ephemeral UI/rendering state;
React Query gateway projections are authoritative, and IndexedDB snapshots are only
provisional startup caches ordered by server revisions.
Feature components and hooks also must not call raw `fetch()` for Cradle Server APIs.
Streaming, binary, external-origin, and low-level credential transports require an exact
reviewed exception in `scripts/check-api-gen-boundaries.ts`; the per-file call count may
only decrease.

## Directories

- **workspace/**: Workspace management — sidebar listing, directory picker, session grouping
- **chat/**: Chat view, composer, snapshot hydration, and sequenced SSE delta transport for the server-owned chat runtime
- **search/**: Global thread search — command-palette dialog backed by jieba tokenization on the main process
- **profile/**: Global user profile assembled from Usage-owned analytics data
- **desktop-tray/**: Electron native tray action bridge and await projection helpers
- **settings/**: Application settings — theme switching, user preferences dialog
- **skills/**: Filesystem-backed skills management — shared inventory/editor UIs for global settings, workspace detail, and per-agent selection
- **ipc-devtool/**: Developer-only IPC observability panel rendered in the second (`/devtool`) BrowserWindow
- **workspace-detail/**: Project detail page for viewing and editing workspace files (README.md, AGENTS.md) with Tiptap WYSIWYG editor
- **`<domain>/api/`**: Feature-owned gateway over generated transport code. New features start here; existing direct imports are reduced under the `check:api-boundaries` ratchet.
