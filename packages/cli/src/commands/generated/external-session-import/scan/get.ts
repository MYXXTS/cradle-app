import { registerOperationCommand } from '../../../../runtime/operation-command'
import type { CliOperationSpec } from '../../../../runtime/types'
import type { Command } from 'commander'

const spec = {
  "arguments": [
    {
      "name": "scanId",
      "required": true,
      "target": "path.scanId",
      "type": "string"
    }
  ],
  "command": [
    "external-session-import",
    "scan",
    "get"
  ],
  "description": "Read an external session import scan",
  "flags": [],
  "method": "get",
  "path": "/external-session-import/scans/{scanId}"
} satisfies CliOperationSpec

export function register(program: Command): void {
  registerOperationCommand(program, spec)
}
