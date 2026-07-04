export const CLAUDE_EXIT_PLAN_MODE_CAPTURED_MESSAGE = 'Cradle captured the proposed plan. Stop here and wait for the user to refine or implement it in a later turn.'

/** Synthetic tool name for the plan-implementation approval projected in `event-to-chunk-mapper.ts`. */
export const CLAUDE_PLAN_IMPLEMENTATION_TOOL_NAME = 'plan_implementation'

export function isClaudeAgentExitPlanModeToolName(toolName: string): boolean {
  return toolName === 'ExitPlanMode' || toolName === 'exit_plan_mode' || toolName === 'exitplanmode'
}

export function isClaudeAgentEnterPlanModeToolName(toolName: string): boolean {
  return toolName === 'EnterPlanMode' || toolName === 'enter_plan_mode' || toolName === 'enterplanmode'
}
