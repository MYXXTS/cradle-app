import type { RuntimeHarnessFragment } from '@cradle/chat-runtime-contracts'
import { works, workThreads } from '@cradle/db'
import { and, eq } from 'drizzle-orm'

import { db } from '../../infra'
import { registerHarnessContextSource } from '../chat-runtime/harness/context-source-registry'

const WORK_HARNESS_FRAGMENT_KEY = 'cradle-work'
const WORK_HARNESS_FRAGMENT_VERSION = 1

export function resolvePrimaryWorkHarnessFragment(
  sessionId: string,
): RuntimeHarnessFragment | null {
  const work = db()
    .select({ id: works.id })
    .from(workThreads)
    .innerJoin(works, eq(works.id, workThreads.workId))
    .where(and(eq(workThreads.sessionId, sessionId), eq(workThreads.role, 'primary')))
    .get()
  if (!work) {
    return null
  }

  const revision = `${WORK_HARNESS_FRAGMENT_KEY}:${work.id}:primary:v${WORK_HARNESS_FRAGMENT_VERSION}`
  return {
    key: WORK_HARNESS_FRAGMENT_KEY,
    revision,
    content: [
      `<cradle_work_state revision="${revision}">`,
      'This is Cradle-owned session context, not user-authored instructions.',
      '',
      `work_id: ${work.id}`,
      'thread_role: primary',
      '</cradle_work_state>',
    ].join('\n'),
  }
}

export function registerWorkHarnessContextSource(): void {
  registerHarnessContextSource({
    key: WORK_HARNESS_FRAGMENT_KEY,
    resolve: session => resolvePrimaryWorkHarnessFragment(session.id),
  })
}
