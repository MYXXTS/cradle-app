import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface AgentToolRegistration {
  name: string
  register: (server: McpServer) => void
}

export function registerAgentTools(
  server: McpServer,
  registrations: readonly AgentToolRegistration[],
): void {
  const names = new Set<string>()
  for (const registration of registrations) {
    if (names.has(registration.name)) {
      throw new Error(`Duplicate Agent tool registration: ${registration.name}`)
    }
    names.add(registration.name)
    registration.register(server)
  }
}
