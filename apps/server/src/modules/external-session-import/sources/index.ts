import { createClaudeSessionSource } from './claude'
import { createCodexSessionSource } from './codex'

export function createExternalSessionSources() {
  return [
    createClaudeSessionSource(),
    createCodexSessionSource(),
  ] as const
}
