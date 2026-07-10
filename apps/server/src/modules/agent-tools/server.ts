import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { registerAgentTools } from './registry'
import { builtinAgentTools } from './tools'

export const AGENT_TOOLS_MCP_SERVER_NAME = 'cradle'

export function createAgentToolsMcpServer(): McpServer {
  const server = new McpServer({
    name: AGENT_TOOLS_MCP_SERVER_NAME,
    version: '0.1.0',
  })
  registerAgentTools(server, builtinAgentTools)
  return server
}
