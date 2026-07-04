# Provider Tools

Cradle-owned provider tool identity and payload contracts.

Provider adapters may read provider-native tool calls, but they should project those calls into the stable tool envelope owned here before the payload reaches chat persistence or frontend rendering. Provider-specific tool identity and payload mapping lives under each provider's own `tools/` directory, for example `claude-agent/tools/` and `codex/tools/`.

## Canonical tool kind

The envelope carries a `kind: CradleToolKind` field — Cradle's own canonical tool-call vocabulary (`'terminal'`, `'file-read'`, `'subagent'`, `'todo'`, ... — see `CradleToolKind` in `@cradle/chat-runtime-contracts`). This is the single source of truth for how a tool call renders in the UI (the frontend's `tool-ui-classifier.ts` reads it directly and no longer guesses from `identifier`/`apiName`).

Each provider owns its own mapping from provider-native tool names to `CradleToolKind`, next to its other tool identity code:

- `claude-agent/tools/mapper.ts` — `classifyClaudeCodeToolKind`, a complete mapping for every `ClaudeCodeToolName`, plus `'mcp'` for any `mcp__<server>__<tool>` name (the SDK's own MCP naming convention).
- `codex/tools/mapper.ts` — `classifyCodexToolKind`. Codex has not been migrated to the rest of this architecture yet, so only the api names the frontend previously classified are mapped; real MCP tool calls (`item.type === 'mcpToolCall'`) are classified as `'mcp'`, everything else (including dynamic tool calls) is `'generic'`.
- `opencode/tools/mapper.ts` — `classifyOpencodeToolKind`, currently always `'generic'` (unmigrated); opencode does not expose a reliable signal to distinguish MCP tool calls from built-ins yet.

When adding a new provider tool, classify it at the point the envelope is created — never reintroduce identity-based guessing on the frontend.

## Files

- `tool-call-payload.ts`: shared `{ identifier, apiName, kind, args, result }` envelope helpers for provider tool call input and output payloads.
