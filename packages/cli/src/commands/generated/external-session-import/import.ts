import { registerOperationCommand } from '../../../runtime/operation-command'
import type { CliOperationSpec } from '../../../runtime/types'
import type { Command } from 'commander'

const spec = {
  "arguments": [],
  "command": [
    "external-session-import",
    "import"
  ],
  "description": "Import selected external sessions into recovered Cradle Workspaces",
  "flags": [
    {
      "name": "scanId",
      "required": true,
      "target": "body.scanId",
      "type": "string"
    },
    {
      "name": "candidateIds",
      "required": true,
      "target": "body.candidateIds",
      "type": "string[]"
    }
  ],
  "method": "post",
  "path": "/external-session-import/imports"
} satisfies CliOperationSpec

export function register(program: Command): void {
  registerOperationCommand(program, spec)
}
