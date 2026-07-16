import { registerOperationCommand } from '../../../runtime/operation-command'
import type { CliOperationSpec } from '../../../runtime/types'
import type { Command } from 'commander'

const spec = {
  "arguments": [],
  "command": [
    "external-session-import",
    "list"
  ],
  "description": "List imported external sessions",
  "flags": [],
  "method": "get",
  "path": "/external-session-import/imports"
} satisfies CliOperationSpec

export function register(program: Command): void {
  registerOperationCommand(program, spec)
}
