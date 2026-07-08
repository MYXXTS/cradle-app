export const CLAUDE_EXIT_PLAN_MODE_CAPTURED_MESSAGE = 'Cradle captured the proposed plan. Stop here and wait for the user to refine or implement it in a later turn.'

/** Synthetic tool name for the plan-implementation approval projected in `event-to-chunk-mapper.ts`. */
export const CLAUDE_PLAN_IMPLEMENTATION_TOOL_NAME = 'plan_implementation'

const CLAUDE_LEGACY_PLAN_FILE_PATH_SEGMENT = '/.claude/plans/'
const CRADLE_PLAN_FILE_PATH_SEGMENT = '/runtimes/claude-agent/plans/'
const CLAUDE_PLAN_FILE_EXTENSIONS = ['.md', '.yml', '.yaml'] as const

export function isClaudeAgentExitPlanModeToolName(toolName: string): boolean {
  return toolName === 'ExitPlanMode' || toolName === 'exit_plan_mode' || toolName === 'exitplanmode'
}

export function isClaudeAgentEnterPlanModeToolName(toolName: string): boolean {
  return toolName === 'EnterPlanMode' || toolName === 'enter_plan_mode' || toolName === 'enterplanmode'
}

/** Recognizes Claude/Cradle plan artifact paths written before ExitPlanMode. */
export function isClaudePlanFilePath(filePath: string): boolean {
  const normalized = filePath.trim()
  if (normalized.length === 0) {
    return false
  }
  const hasPlanDirectory = normalized.includes(CLAUDE_LEGACY_PLAN_FILE_PATH_SEGMENT)
    || normalized.includes(CRADLE_PLAN_FILE_PATH_SEGMENT)
  if (!hasPlanDirectory) {
    return false
  }
  const lower = normalized.toLowerCase()
  return CLAUDE_PLAN_FILE_EXTENSIONS.some(extension => lower.endsWith(extension))
}

export function isClaudeAgentIntentionalExitPlanModeDenial(errorText: string): boolean {
  const normalizedErrorText = errorText.startsWith('Error: ')
    ? errorText.slice('Error: '.length)
    : errorText
  return normalizedErrorText === CLAUDE_EXIT_PLAN_MODE_CAPTURED_MESSAGE
    || normalizedErrorText === 'Exit plan mode?'
}
