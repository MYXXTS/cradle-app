# opencode

opencode Chat Runtime adapter.

This package owns opencode-native server lifecycle, provider config projection, prompt input projection, and opencode message-part to AI SDK chunk mapping. Cradle Chat Runtime owns runtime selection, durable binding, queues, sessions, and persistence.

The adapter always launches an opencode SDK server through `createOpencode`; it does not support client-only mode. Cradle provider targets are projected into opencode-native `config.provider[...]` entries and `config.model` values shaped as `providerID/modelID`. Native opencode details stay under this package instead of expanding the generic Provider API.

Runtime presentation is provider-owned. `getPresentation()` reads opencode `command.list()` from the live SDK server, exposes those entries as Chat Runtime slash commands, and declares opencode UI slots for quick question, status, model, and terminal surfaces. Submitted composer text that exactly matches a listed `/command` is routed to `session.command()`; other turns continue through `session.prompt()`.

`/btw` quick questions use a temporary opencode session seeded with Cradle-owned transcript text and are deleted after streaming. This keeps Cradle's no-history quick-question contract without requiring users to define an opencode command. Shell execution uses `session.shell()` against the active opencode session and projects the resulting message parts into the Chat Runtime shell result envelope. Rollback uses `session.messages()` to locate the latest assistant message, then calls `session.revert()`; workspace file changes are not reverted.

Title regeneration uses opencode `session.summarize()` with `small_model` when configured, then reads the updated session title through `session.get()`. In `@opencode-ai/sdk@1.17.11`, `session.summarize()` returns a boolean rather than the title string.

Live steer-turn and runtime settings are not declared for opencode. The current Chat Runtime `steerTurn` hook is a live-turn operation without workspace/model/system-prompt context, while opencode exposes revert/unrevert primitives rather than an active-turn steer API.

## Files

- `metadata.ts`: runtime identity and static capability metadata.
- `presentation.ts`: opencode command and UI slot projection.
- `config.ts`: Cradle provider target to opencode `Config` projection.
- `runtime-context.ts`: opencode SDK server host resource acquisition.
- `input-projector.ts`: Chat Runtime message input to opencode prompt parts.
- `event-to-chunk-mapper.ts`: opencode prompt result parts to AI SDK `UIMessageChunk` events.
- `tools/`: Cradle-owned stable tool envelope projection for opencode tool parts.
- `provider.ts`: `ChatRuntime` facade for session start/resume, prompt turns, and cancellation.
