import { describe, expect, it } from 'vitest'

import {
  isClaudeAgentIntentionalExitPlanModeDenial,
  isClaudePlanFilePath,
} from './plan-mode'

describe('plan-mode', () => {
  it('recognizes legacy Claude plan markdown paths', () => {
    expect(isClaudePlanFilePath('/Users/wibus/.claude/plans/example.md')).toBe(true)
  })

  it('recognizes Cradle-owned plan artifact paths', () => {
    expect(isClaudePlanFilePath(
      '/Users/wibus/Library/Application Support/@cradle/desktop/data/runtimes/claude-agent/plans/quirky-squishing-eich.yml',
    )).toBe(true)
  })

  it('rejects non-plan files', () => {
    expect(isClaudePlanFilePath('/Users/wibus/dev/cradle-app/README.md')).toBe(false)
  })

  it('detects intentional ExitPlanMode denial messages', () => {
    expect(isClaudeAgentIntentionalExitPlanModeDenial(
      'Error: Cradle captured the proposed plan. Stop here and wait for the user to refine or implement it in a later turn.',
    )).toBe(true)
    expect(isClaudeAgentIntentionalExitPlanModeDenial('Exit plan mode?')).toBe(true)
    expect(isClaudeAgentIntentionalExitPlanModeDenial('Permission denied')).toBe(false)
  })
})
