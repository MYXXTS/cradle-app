import { registerOperationCommand } from '../../../runtime/operation-command'
import type { CliOperationSpec } from '../../../runtime/types'
import type { Command } from 'commander'

const spec = {
  "arguments": [
    {
      "name": "namespace",
      "required": true,
      "target": "path.namespace",
      "type": "string"
    },
    {
      "name": "resourceType",
      "required": true,
      "target": "path.resourceType",
      "type": "string"
    },
    {
      "name": "resourceId",
      "required": true,
      "target": "path.resourceId",
      "type": "string"
    }
  ],
  "command": [
    "managed-resources",
    "uninstall"
  ],
  "description": "Uninstall a declared managed resource",
  "flags": [],
  "method": "delete",
  "path": "/managed-resources/{namespace}/{resourceType}/{resourceId}"
} satisfies CliOperationSpec

export function register(program: Command): void {
  registerOperationCommand(program, spec)
}
