import { sessionGroups, sessions, workspaces } from '@cradle/db'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { db } from '../../../infra'
import { localWorkspaceLocator, serializeWorkspaceLocator } from '../../workspace/workspace-locator'
import { resolveSessionSystemPrompt } from './turn-context'

const WORKSPACE_ID = 'workspace-turn-context-test'

afterEach(() => {
  db().delete(sessions).run()
  db().delete(sessionGroups).run()
  db().delete(workspaces).run()
})

describe('resolveSessionSystemPrompt session group context', () => {
  it('appends session group context without description or sibling transcripts', () => {
    db().insert(workspaces).values({
      id: WORKSPACE_ID,
      name: 'Turn Context Workspace',
      locatorJson: serializeWorkspaceLocator(localWorkspaceLocator('/tmp/turn-context')),
      identifier: 'TCT',
    }).run()

    const group = db().insert(sessionGroups).values({
      id: 'group-1',
      workspaceId: WORKSPACE_ID,
      title: 'Implement auth',
      status: 'active',
    }).returning().get()

    db().insert(sessions).values([
      {
        id: 'session-current',
        workspaceId: WORKSPACE_ID,
        title: 'API session',
        sessionGroupId: group.id,
      },
      {
        id: 'session-sibling',
        workspaceId: WORKSPACE_ID,
        title: 'UI session',
        sessionGroupId: group.id,
      },
    ]).run()

    const session = db().select().from(sessions).where(eq(sessions.id, 'session-current')).get()!
    const prompt = resolveSessionSystemPrompt(session)

    expect(prompt).toContain('## Session Group')
    expect(prompt).toContain('Implement auth')
    expect(prompt).toContain('- UI session')
    expect(prompt).not.toContain('Goal:')
    expect(prompt).not.toContain('API session')
    expect(prompt).toContain('Do not assume shared transcript with sibling sessions.')
  })
})
