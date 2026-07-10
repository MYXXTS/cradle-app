import { registerOperationCommand } from '../../../runtime/operation-command'
import type { CliOperationSpec } from '../../../runtime/types'
import type { Command } from 'commander'

const spec = {
  "arguments": [
    {
      "name": "id",
      "required": true,
      "target": "path.id",
      "type": "string"
    }
  ],
  "command": [
    "work",
    "archive"
  ],
  "description": "Archive or restore Work",
  "flags": [
    {
      "name": "archived",
      "required": true,
      "target": "body.archived",
      "type": "boolean"
    }
  ],
  "method": "post",
  "path": "/works/{id}/archive"
} satisfies CliOperationSpec

export function register(program: Command): void {
  registerOperationCommand(program, spec)
}
