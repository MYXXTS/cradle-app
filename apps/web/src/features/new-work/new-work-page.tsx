import {
  FolderLine as FolderIcon,
  NewFolderLine as FolderPlusIcon,
} from '@mingcute/react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import type { FileUIPart } from 'ai'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getWorksQueryKey } from '~/api-gen/@tanstack/react-query.gen'
import { postWorks } from '~/api-gen/sdk.gen'
import type { PostWorksData } from '~/api-gen/types.gen'
import { useRegisterLayoutSlots } from '~/components/layout/use-layout-slots'
import { Button } from '~/components/ui/button'
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '~/components/ui/menu'
import type { DraftChatComposerSubmitOptions } from '~/features/chat/composer/draft-chat-composer'
import { DraftChatComposerWithState } from '~/features/chat/composer/draft-chat-composer'
import type { ChatContextPart } from '~/features/chat/context/chat-context-parts'
import { readRunRuntimeSettingsPatch } from '~/features/chat/runtime/runtime-settings-presenter'
import { startOptimisticChatResponse } from '~/features/chat/session/optimistic-chat-turn'
import { useComposerState } from '~/features/composer-toolbar'
import { isLocalWorkspace } from '~/features/workspace/types'
import { sessionsQueryKey } from '~/features/workspace/use-session'
import { useAddWorkspace, useWorkspaces, WORKSPACES_QUERY_KEY } from '~/features/workspace/use-workspace'
import { apiErrorMessage } from '~/lib/api-error'
import { openWork, openWorkspaceDiffs } from '~/navigation/navigation-commands'
import { useSurfaceActive } from '~/navigation/surface-activity-context'

function isDirtySourceError(error: unknown): boolean {
  return !!error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'work_source_dirty'
}

export function NewWorkPage() {
  const { t } = useTranslation('work')
  const active = useSurfaceActive()
  const search = useSearch({ from: '/work/new' })
  const queryClient = useQueryClient()
  const { workspaces, loading } = useWorkspaces()
  const { addFromPicker, adding } = useAddWorkspace()
  const localWorkspaces = useMemo(
    () => workspaces.filter(isLocalWorkspace),
    [workspaces],
  )
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    if (search.workspaceId) {
      return search.workspaceId
    }
    try {
      return localStorage.getItem('cradle:lastWorkspaceId')
    }
    catch {
      return null
    }
  })
  const [error, setError] = useState<unknown>(null)
  const selectedWorkspace = localWorkspaces.find(workspace => workspace.id === selectedWorkspaceId) ?? null
  const composerState = useComposerState({
    context: 'new-chat',
    workspaceId: selectedWorkspace?.id ?? null,
    enableAgents: true,
  })

  useEffect(() => {
    if (selectedWorkspaceId && !localWorkspaces.some(workspace => workspace.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(localWorkspaces[0]?.id ?? null)
    }
  }, [localWorkspaces, selectedWorkspaceId])

  useEffect(() => {
    try {
      if (selectedWorkspaceId) {
        localStorage.setItem('cradle:lastWorkspaceId', selectedWorkspaceId)
      }
    }
    catch {}
  }, [selectedWorkspaceId])

  useRegisterLayoutSlots('new-work', useMemo(() => ({
    asideWorkspaceId: selectedWorkspace?.id ?? null,
    hasAside: !!selectedWorkspace,
    hasBrowserPanel: !!selectedWorkspace,
  }), [selectedWorkspace]))

  const handleSend = async (
    text: string,
    files: FileUIPart[],
    contextParts: ChatContextPart[],
    options: DraftChatComposerSubmitOptions,
  ) => {
    if (!selectedWorkspace) {
      setError(new Error(t('new.workspaceRequired')))
      return false
    }
    if (
      !options.agentId
      && !options.providerTargetId
      && options.providerBinding !== 'runtime-owned'
    ) {
      return false
    }

    const objective = text.trim()
    const title = objective.slice(0, 80)
      || options.agentName
      || options.providerTargetName
      || t('surface.work')
    const body: PostWorksData['body'] = {
      workspaceId: selectedWorkspace.id,
      title,
      objective,
      linkedIssueId: search.issueId,
      runtimeKind: options.runtimeKind,
      runtimeSettings: options.runtimeSettings,
      thinkingEffort: options.thinkingEffort,
      ...(options.agentId
        ? { agentId: options.agentId }
        : {
            providerTargetId: options.providerTargetId,
            modelId: options.modelId ?? null,
          }),
    }

    setError(null)
    const result = await postWorks({ body })
    if (result.error || !result.data) {
      setError(result.error ?? new Error(t('new.createFailed')))
      return false
    }

    const detail = result.data
    startOptimisticChatResponse({
      sessionId: detail.primaryThread.id,
      queryClient,
      body: {
        text: objective,
        files,
        contextParts,
        modelId: options.modelId,
        thinkingEffort: options.thinkingEffort,
        runtimeSettings: readRunRuntimeSettingsPatch(options.runtimeSettings),
      },
      onAccepted: () => {
        void queryClient.invalidateQueries({ queryKey: getWorksQueryKey() })
      },
      onError: (responseError) => {
        setError(responseError)
      },
    })
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: getWorksQueryKey() }),
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey(selectedWorkspace.id) }),
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
    ])
    openWork(detail.work.id, { replace: true })
    return true
  }

  const workspaceSelector = (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="xs" className="text-foreground hover:text-foreground" />}
        data-testid="new-work-workspace-selector"
      >
        <FolderIcon className="size-3 shrink-0" />
        <span className="max-w-32 truncate">
          {selectedWorkspace?.name ?? t('new.workspace')}
        </span>
      </MenuTrigger>
      <MenuPopup>
        <MenuGroup>
          <MenuGroupLabel>{t('new.workspace')}</MenuGroupLabel>
          <MenuSeparator />
          {localWorkspaces.map(workspace => (
            <MenuItem
              key={workspace.id}
              onClick={() => setSelectedWorkspaceId(workspace.id)}
            >
              <FolderIcon className="size-3" />
              <span className="flex-1">{workspace.name}</span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={() => void addFromPicker()} disabled={adding}>
            <FolderPlusIcon className="size-3" />
            <span className="flex-1">
              {adding ? t('new.addingProject') : t('new.addProject')}
            </span>
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  )

  const dirty = isDirtySourceError(error)
  return (
    <div className="flex h-full flex-col bg-background" data-testid="new-work-page">
      <div className="flex flex-1 items-center justify-center px-6 pb-8">
        <div className="w-full max-w-160">
          <div className="mb-5 px-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('new.title')}</h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              {t('new.description')}
            </p>
          </div>
          <DraftChatComposerWithState
            composerState={composerState}
            workspaceId={selectedWorkspace?.id ?? null}
            active={active}
            contextBar={workspaceSelector}
            onSend={handleSend}
            sendButtonText={t('new.start')}
            testIdPrefix="new-work"
          />
          {!loading && localWorkspaces.length === 0 && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {t('new.noLocalWorkspace')}
            </div>
          )}
          {error !== null && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3" data-testid="new-work-error">
              <div className="text-sm font-medium text-foreground">
                {dirty ? t('new.dirtyTitle') : t('new.createFailed')}
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {dirty ? t('new.dirtyDescription') : apiErrorMessage(error)}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {dirty && selectedWorkspace && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openWorkspaceDiffs({ workspaceId: selectedWorkspace.id })}
                  >
                    {t('new.openChanges')}
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => setError(null)}>
                  {t('new.tryAgain')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
