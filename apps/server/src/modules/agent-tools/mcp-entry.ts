import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createAgentToolsMcpServer } from './server'

async function main(): Promise<void> {
  const server = createAgentToolsMcpServer()
  await server.connect(new StdioServerTransport())
}

main().catch((error) => {
  console.error('[agent-tools] fatal error', error)
  process.exit(1)
})
