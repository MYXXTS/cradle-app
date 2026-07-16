import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, describe, expect, it } from 'vitest'

import { createClaudeSessionSource } from './claude'
import { createCodexSessionSource } from './codex'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('external session source adapters', () => {
  it('uses Claude SDK main-session discovery and merges tool results into assistant history', async () => {
    const session = {
      sessionId: 'claude-main-1',
      summary: 'Investigate import behavior',
      firstPrompt: 'Investigate import behavior',
      lastModified: 1_800_000_000_000,
      createdAt: 1_799_999_000_000,
      fileSize: 4_096,
      cwd: '/workspace/project',
      gitBranch: 'main',
    } satisfies SDKSessionInfo
    const entries = [
      {
        type: 'user',
        uuid: 'user-1',
        session_id: session.sessionId,
        parent_tool_use_id: null,
        parent_agent_id: null,
        timestamp: '2027-01-15T07:00:00.000Z',
        message: { role: 'user', content: 'Investigate import behavior' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-tool',
        session_id: session.sessionId,
        parent_tool_use_id: null,
        parent_agent_id: null,
        timestamp: '2027-01-15T07:00:01.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'src/app.ts' } }],
        },
      },
      {
        type: 'user',
        uuid: 'tool-result',
        session_id: session.sessionId,
        parent_tool_use_id: null,
        parent_agent_id: null,
        timestamp: '2027-01-15T07:00:02.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents' }],
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-text',
        session_id: session.sessionId,
        parent_tool_use_id: null,
        parent_agent_id: null,
        timestamp: '2027-01-15T07:00:03.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'The importer needs a source catalog.' }] },
      },
    ] as Array<SessionMessage & { timestamp: string }>
    const source = createClaudeSessionSource({
      listSessions: async () => [session],
      getSessionMessages: async () => entries,
      listSubagents: async () => ['agent-a', 'agent-b'],
    })

    const [descriptor] = await source.discover({ sourceHostId: 'local' })
    expect(descriptor).toMatchObject({
      sourceApp: 'claude',
      externalSessionId: session.sessionId,
      workspacePath: session.cwd,
      childSessionCount: null,
    })

    const result = await source.read({ descriptor: descriptor! })
    expect(result.descriptor.childSessionCount).toBe(2)
    expect(result.messages.map(message => message.message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(result.messages[1]?.message.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-Read',
        toolCallId: 'tool-1',
        state: 'output-available',
        output: 'file contents',
      }),
      expect.objectContaining({
        type: 'text',
        text: 'The importer needs a source catalog.',
      }),
    ]))
    expect(result.fidelity).toMatchObject({
      messages: 2,
      toolCalls: 1,
      childSessions: 2,
    })
  })

  it('discovers current and archived Codex roots while excluding SubAgents from top-level candidates', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cradle-codex-import-'))
    tempDirectories.push(root)
    const current = join(root, 'sessions')
    const archived = join(root, 'archived_sessions')
    mkdirSync(join(current, '2027', '01', '15'), { recursive: true })
    mkdirSync(archived, { recursive: true })

    const mainPath = join(current, '2027', '01', '15', 'main.jsonl')
    writeJsonLines(mainPath, [
      sessionMeta({ id: 'codex-main', cwd: '/workspace/project', source: 'cli' }),
      responseItem('2027-01-15T07:00:01.000Z', {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Build a better importer' }],
      }),
      responseItem('2027-01-15T07:00:02.000Z', {
        type: 'function_call',
        name: 'command_execution',
        arguments: JSON.stringify({ command: 'pwd' }),
        call_id: 'call-1',
      }),
      responseItem('2027-01-15T07:00:03.000Z', {
        type: 'function_call_output',
        call_id: 'call-1',
        output: JSON.stringify({ output: '/workspace/project', exitCode: 0 }),
      }),
      responseItem('2027-01-15T07:00:04.000Z', {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Importer designed.' }],
      }),
    ])
    writeJsonLines(join(current, '2027', '01', '15', 'subagent.jsonl'), [
      sessionMeta({
        id: 'codex-child',
        cwd: '/workspace/project',
        source: 'subagent',
        parent_thread_id: 'codex-main',
      }),
    ])
    writeJsonLines(join(archived, 'archived.jsonl'), [
      sessionMeta({ id: 'codex-archived', cwd: '/workspace/old', source: 'cli' }),
      responseItem('2027-01-14T07:00:01.000Z', {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Archived work' }],
      }),
    ])

    const source = createCodexSessionSource({ roots: { current, archived }, concurrency: 2 })
    const descriptors = await source.discover({ sourceHostId: 'local' })
    expect(descriptors).toHaveLength(2)
    expect(descriptors.map(descriptor => descriptor.externalSessionId)).toEqual([
      'codex-main',
      'codex-archived',
    ])
    expect(descriptors[0]).toMatchObject({
      archived: false,
      childSessionCount: 1,
      title: 'Build a better importer',
    })
    expect(descriptors[1]).toMatchObject({ archived: true })

    const imported = await source.read({ descriptor: descriptors[0]! })
    expect(imported.messages.map(message => message.message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(imported.messages[1]?.message.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-command_execution',
        toolCallId: 'call-1',
        state: 'output-available',
      }),
      expect.objectContaining({ type: 'text', text: 'Importer designed.' }),
    ]))
  })
})

function writeJsonLines(path: string, rows: unknown[]): void {
  writeFileSync(path, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8')
}

function sessionMeta(payload: Record<string, unknown>) {
  return {
    timestamp: '2027-01-15T07:00:00.000Z',
    type: 'session_meta',
    payload: {
      timestamp: '2027-01-15T07:00:00.000Z',
      originator: 'codex-cli',
      cli_version: '1.0.0',
      model_provider: 'openai',
      base_instructions: null,
      ...payload,
    },
  }
}

function responseItem(timestamp: string, payload: Record<string, unknown>) {
  return { timestamp, type: 'response_item', payload }
}
