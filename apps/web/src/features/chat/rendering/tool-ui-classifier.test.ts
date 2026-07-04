import { describe, expect, it } from 'vitest'

import type { RenderableToolPart } from './tool-ui-classifier'
import { describeToolCall } from './tool-ui-classifier'

function toolPart(input: unknown, type = 'tool-Bash'): RenderableToolPart {
  return {
    type: type as `tool-${string}`,
    toolCallId: 'tool-call-1',
    state: 'output-available',
    input,
  }
}

describe('describeToolCall', () => {
  it('trusts the server-computed canonical kind carried on the builtin envelope', () => {
    const descriptor = describeToolCall(toolPart({
      type: 'cradle.builtin-tool-call.input.v1',
      identifier: 'claude-code',
      apiName: 'Bash',
      kind: 'terminal',
      args: {
        command: 'git status',
        description: 'Show working tree status',
      },
    }))

    expect(descriptor.kind).toBe('terminal')
    expect(descriptor.title).toBe('Show working tree status')
    expect(descriptor.target).toBe('git status')
  })

  it('classifies canonical Claude Code Agent as subagent from the envelope kind', () => {
    const descriptor = describeToolCall(toolPart({
      type: 'cradle.builtin-tool-call.input.v1',
      identifier: 'claude-code',
      apiName: 'Agent',
      kind: 'subagent',
      args: {
        description: 'Investigate the failure',
      },
    }, 'tool-Agent'))

    expect(descriptor.kind).toBe('subagent')
    expect(descriptor.target).toBe('Investigate the failure')
  })

  it('never promotes a Bash call to subagent just because it carries a description', () => {
    const descriptor = describeToolCall(toolPart({
      type: 'cradle.builtin-tool-call.input.v1',
      identifier: 'claude-code',
      apiName: 'Bash',
      kind: 'terminal',
      args: {
        command: 'git status',
        description: 'Looks like a subagent launch, but it is not',
      },
    }))

    expect(descriptor.kind).toBe('terminal')
  })

  it('falls back to generic for envelopes persisted before kind existed', () => {
    const descriptor = describeToolCall(toolPart({
      type: 'cradle.builtin-tool-call.input.v1',
      identifier: 'claude-code',
      apiName: 'Bash',
      args: {
        command: 'git status',
      },
    }))

    expect(descriptor.kind).toBe('generic')
  })

  it('does not promote raw payload fields into semantic tool kinds', () => {
    const descriptor = describeToolCall(toolPart({
      command: 'git status',
      description: 'Show working tree status',
    }))

    expect(descriptor.kind).toBe('generic')
    expect(descriptor.title).toBe('Show working tree status')
    expect(descriptor.toolName).toBe('tool-Bash')
    expect(descriptor.displayName).toBe('Tool Bash')
  })
})
