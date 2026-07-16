import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { openExternalSessionBundleFile } from '../bundle-store'
import { createClaudeSessionSource } from './claude'
import { createCodexSessionSource } from './codex'

const tempDirectories: string[] = []
const previousDataDir = process.env.CRADLE_DATA_DIR

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  if (previousDataDir === undefined) {
    delete process.env.CRADLE_DATA_DIR
  }
  else {
    process.env.CRADLE_DATA_DIR = previousDataDir
  }
})

describe('external session source adapters', () => {
  it('groups Claude JSONL children, captures raw files, and parses only the Cradle-owned bundle', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cradle-claude-import-'))
    tempDirectories.push(root)
    process.env.CRADLE_DATA_DIR = join(root, 'data')
    const projects = join(root, 'projects')
    const project = join(projects, '-workspace-project')
    const sessionId = 'claude-main-1'
    const mainPath = join(project, `${sessionId}.jsonl`)
    const childPath = join(project, sessionId, 'subagents', 'agent-a.jsonl')
    mkdirSync(join(project, sessionId, 'subagents'), { recursive: true })
    writeJsonLines(mainPath, [
      claudeRow(sessionId, 'user-1', 'user', 'Investigate import behavior'),
      claudeRow(sessionId, 'assistant-tool', 'assistant', [
        { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'src/app.ts' } },
      ]),
      claudeRow(sessionId, 'tool-result', 'user', [
        { type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents' },
      ]),
      claudeRow(sessionId, 'assistant-text', 'assistant', [
        { type: 'text', text: 'The importer needs a source catalog.' },
      ]),
    ])
    writeJsonLines(childPath, [
      { ...claudeRow(sessionId, 'child-user', 'user', 'Inspect the parser'), agentId: 'a' },
    ])
    const originalMainBytes = readFileSync(mainPath)
    const source = createClaudeSessionSource({ root: projects, concurrency: 2 })

    const [descriptor] = await source.discover({ sourceHostId: 'local' })
    expect(descriptor).toMatchObject({
      sourceApp: 'claude',
      externalSessionId: sessionId,
      workspacePath: '/workspace/project',
      childSessionCount: 1,
    })

    const bundle = await source.capture({ descriptor: descriptor! })
    expect(bundle.manifest.files).toHaveLength(2)
    const bundledMain = bundle.manifest.files.find(file => file.kind === 'main')!
    expect(await readBytes(openExternalSessionBundleFile(bundle, bundledMain))).toEqual(originalMainBytes)
    rmSync(projects, { recursive: true, force: true })
    const result = await source.read({ descriptor: descriptor!, bundle })
    expect(result.descriptor.childSessionCount).toBe(1)
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
      childSessions: 1,
    })
  })

  it('discovers current and archived Codex roots while excluding SubAgents from top-level candidates', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cradle-codex-import-'))
    tempDirectories.push(root)
    process.env.CRADLE_DATA_DIR = join(root, 'data')
    const current = join(root, 'sessions')
    const archived = join(root, 'archived_sessions')
    mkdirSync(join(current, '2027', '01', '15'), { recursive: true })
    mkdirSync(archived, { recursive: true })
    writeJsonLines(join(root, 'session_index.jsonl'), [
      { id: 'codex-main', thread_name: 'Named rollout' },
    ])
    writeJsonLines(join(root, 'history.jsonl'), [
      { session_id: 'codex-main', ts: 1_800_000_000, text: 'Build a better importer' },
    ])

    const mainPath = join(current, '2027', '01', '15', 'main.jsonl')
    writeJsonLines(mainPath, [
      sessionMeta({ id: 'codex-main', cwd: '/workspace/project', source: 'cli' }),
      responseItem('2027-01-15T07:00:01.000Z', {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '# AGENTS.md instructions for fixture' }],
      }),
      codexUserEvent('2027-01-15T07:00:01.500Z', 'Build a better importer'),
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
      codexUserEvent('2027-01-14T07:00:01.500Z', 'Archived work'),
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
      title: 'Named rollout',
      summary: 'Build a better importer',
    })
    expect(descriptors[1]).toMatchObject({ archived: true })

    const bundle = await source.capture({ descriptor: descriptors[0]! })
    const imported = await source.read({ descriptor: descriptors[0]!, bundle })
    expect(imported.messages.map(message => message.message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(imported.messages[0]?.message.parts).toEqual([
      { type: 'text', text: 'Build a better importer' },
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

function codexUserEvent(timestamp: string, message: string) {
  return {
    timestamp,
    type: 'event_msg',
    payload: { type: 'user_message', message, images: [], local_images: [] },
  }
}

function claudeRow(
  sessionId: string,
  uuid: string,
  role: 'user' | 'assistant',
  content: string | Array<Record<string, unknown>>,
) {
  return {
    type: role,
    uuid,
    sessionId,
    cwd: '/workspace/project',
    gitBranch: 'main',
    timestamp: '2027-01-15T07:00:00.000Z',
    message: { role, content },
  }
}

async function readBytes(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
