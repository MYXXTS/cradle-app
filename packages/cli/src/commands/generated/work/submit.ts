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
    "submit"
  ],
  "description": "Explicitly create or update the Work draft pull request",
  "flags": [
    {
      "name": "title",
      "required": false,
      "target": "body.title",
      "type": "string"
    },
    {
      "name": "summary",
      "required": false,
      "target": "body.summary",
      "type": "string"
    },
    {
      "name": "testPlan",
      "required": false,
      "target": "body.testPlan",
      "type": "string"
    },
    {
      "name": "base",
      "required": false,
      "target": "body.base",
      "type": "string"
    }
  ],
  "method": "post",
  "path": "/works/{id}/submit"
} satisfies CliOperationSpec

export function register(program: Command): void {
  registerOperationCommand(program, spec)
}
