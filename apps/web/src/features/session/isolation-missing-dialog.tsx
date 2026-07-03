import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import { toastManager } from '~/components/ui/toast'

import {
  useCleanupWorktree,
  useLeaveSessionIsolation,
  useRepairSessionIsolation,
} from './use-session-isolation'

interface IsolationMissingDialogProps {
  sessionId: string
  workspaceId: string | null
  worktreeId: string | null
  open: boolean
}

export function IsolationMissingDialog({
  sessionId,
  workspaceId,
  worktreeId,
  open,
}: IsolationMissingDialogProps) {
  const { t } = useTranslation('session-isolation')
  const repair = useRepairSessionIsolation()
  const leave = useLeaveSessionIsolation()
  const cleanup = useCleanupWorktree()

  const handleRepair = async () => {
    try {
      await repair.mutateAsync({ sessionId, workspaceId })
      toastManager.add({
        type: 'success',
        title: t('missing.repairSuccess'),
      })
    }
    catch (error) {
      toastManager.add({
        type: 'error',
        title: t('missing.errorTitle'),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleLeave = async () => {
    try {
      await leave.mutateAsync({ sessionId, workspaceId })
    }
    catch (error) {
      toastManager.add({
        type: 'error',
        title: t('missing.errorTitle'),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleAbandon = async () => {
    if (!workspaceId || !worktreeId) {
      await handleLeave()
      return
    }
    try {
      await cleanup.mutateAsync({
        workspaceId,
        worktreeId,
        mode: 'abandon',
      })
    }
    catch (error) {
      toastManager.add({
        type: 'error',
        title: t('missing.errorTitle'),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const busy = repair.isPending || leave.isPending || cleanup.isPending

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        data-testid="isolation-missing-dialog"
        onEscapeKeyDown={(event) => {
          event.preventDefault()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('missing.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('missing.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void handleRepair()
            }}
          >
            {t('missing.repair')}
          </AlertDialogAction>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void handleLeave()}
          >
            {t('missing.leaveMain')}
          </Button>
          <AlertDialogCancel
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void handleAbandon()
            }}
          >
            {t('missing.abandon')}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
