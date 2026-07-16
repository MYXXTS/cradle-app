import { registerOperationCommand } from '../../../runtime/operation-command'
import type { CliOperationSpec } from '../../../runtime/types'
import type { Command } from 'commander'

const spec = {
  "arguments": [
    {
      "name": "importId",
      "required": true,
      "target": "path.importId",
      "type": "string"
    }
  ],
  "command": [
    "external-session-import",
    "sync"
  ],
  "description": "Synchronize appended provider history into an imported session",
  "flags": [
    {
      "name": "scanId",
      "required": true,
      "target": "body.scanId",
      "type": "string"
    },
    {
      "name": "candidateId",
      "required": true,
      "target": "body.candidateId",
      "type": "string"
    }
  ],
  "method": "post",
  "path": "/external-session-import/imports/{importId}/sync"
} satisfies CliOperationSpec

export function register(program: Command): void {
  registerOperationCommand(program, spec)
}
