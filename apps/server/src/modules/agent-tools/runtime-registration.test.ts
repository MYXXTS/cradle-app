import { afterEach, describe, expect, it } from 'vitest'

import { getRegisteredMcpServers, removeHostMcpServer } from '../../plugins/mcp-registry'
import { registerAgentToolsMcpServer } from './runtime-registration'

afterEach(() => {
  removeHostMcpServer('cradle')
})

describe('agent tools MCP registration', () => {
  it('registers one builtin cradle stdio server', () => {
    registerAgentToolsMcpServer()

    expect(getRegisteredMcpServers()).toHaveProperty('cradle', expect.objectContaining({
      transport: 'stdio',
      name: 'cradle',
      command: process.execPath,
      args: expect.arrayContaining([
        '--import',
        expect.stringMatching(/tsx.+loader\.mjs$/),
      ]),
      env: expect.objectContaining({
        CRADLE_SERVER_URL: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
      }),
    }))
  })
})
