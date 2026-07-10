import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { AgentToolHttpRequestError, requestAgentToolJson } from '../../http-client'
import type { AgentToolRegistration } from '../../registry'

export const WORK_PREPARE_TOOL_NAME = 'work_prepare'
export const WORK_PREPARE_TOOL_DESCRIPTION = [
  'REQUIRED FINALIZATION TOOL FOR CRADLE WORK.',
  'You MUST call this tool before claiming that a Cradle Work task is complete or ending the turn successfully.',
  'Call it only after the requested implementation is finished, relevant verification has run, all intended changes are committed locally, and the managed Worktree checkout is clean.',
  'If the tool returns an error, you MUST NOT claim completion. Fix the reported readiness problem and call this tool again, or clearly report the blocker to the user.',
  'This tool only validates local readiness and records the proposed handoff title, summary, and test plan.',
  'It NEVER pushes a branch, creates or updates a pull request, marks a pull request ready, merges, or performs any other GitHub action.',
].join(' ')

const WorkPrepareResponseSchema = z.object({
  work: z.object({
    id: z.string(),
    preparedAt: z.number().nullable(),
  }),
  readiness: z.object({
    clean: z.boolean(),
    commitsAhead: z.number(),
  }),
})

export interface WorkPrepareToolInput {
  workId: string
  title: string
  summary: string
  testPlan: string
}

export async function executeWorkPrepareTool({
  workId,
  title,
  summary,
  testPlan,
}: WorkPrepareToolInput) {
  try {
    const response = await requestAgentToolJson({
      path: `/works/${encodeURIComponent(workId)}/prepare`,
      body: { title, summary, testPlan },
      responseSchema: WorkPrepareResponseSchema,
    })
    return {
      content: [{
        type: 'text' as const,
        text: `Work ${response.work.id} is prepared for explicit user submission. Local readiness: clean checkout, ${response.readiness.commitsAhead} commit(s) ahead. Stop and wait for the user to review or submit; do not push or create a pull request.`,
      }],
      structuredContent: {
        workId: response.work.id,
        preparedAt: response.work.preparedAt,
        prepared: true,
        clean: response.readiness.clean,
        commitsAhead: response.readiness.commitsAhead,
      },
    }
  }
  catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    return {
      content: [{
        type: 'text' as const,
        text: normalized instanceof AgentToolHttpRequestError
          ? `Work preparation failed (${normalized.code ?? 'request_failed'}): ${normalized.message}. Do not claim completion; resolve this local readiness problem and call work_prepare again, or report the blocker.`
          : `Work preparation failed: ${normalized.message}. Do not claim completion; resolve the problem and call work_prepare again, or report the blocker.`,
      }],
      isError: true,
    }
  }
}

function registerWorkPrepareTool(server: McpServer): void {
  server.registerTool(
    WORK_PREPARE_TOOL_NAME,
    {
      title: 'Prepare Cradle Work handoff',
      description: WORK_PREPARE_TOOL_DESCRIPTION,
      inputSchema: {
        workId: z.string().min(1).describe('The active Cradle Work ID supplied in the Work runtime context.'),
        title: z.string().min(1).describe('A concise review title describing the completed local Work.'),
        summary: z.string().min(1).describe('A concrete summary of what changed and why.'),
        testPlan: z.string().min(1).describe('The verification already performed and any remaining reviewer checks.'),
      },
    },
    executeWorkPrepareTool,
  )
}

export const workPrepareTool: AgentToolRegistration = {
  name: WORK_PREPARE_TOOL_NAME,
  register: registerWorkPrepareTool,
}
