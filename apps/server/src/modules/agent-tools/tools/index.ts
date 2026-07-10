import type { AgentToolRegistration } from '../registry'
import { workPrepareTool } from './work/prepare'

export const builtinAgentTools: readonly AgentToolRegistration[] = [
  workPrepareTool,
]
