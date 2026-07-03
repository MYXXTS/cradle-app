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

import { useActivateSessionIsolation } from './use-session-isolation'

interface IsolationBoundaryDialogProps {
  sessionId: string
  workspaceId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IsolationBoundaryDialog({
  sessionId,
  workspaceId,
  open,
  onOpenChange,
}: IsolationBoundaryDialogProps) {
  const { t } = useTranslation('session-isolation')
  const activate = useActivateSessionIsolation()

  const handleMode = async (mode: 'migrate' | 'leave-main' | 'cancel') => {
    try {
      await activate.mutateAsync({ sessionId, mode, workspaceId })
      onOpenChange(false)
    }
    catch (error) {
      toastManager.add({
        type: 'error',
        title: t('boundary.errorTitle'),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="isolation-boundary-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('boundary.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('boundary.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          <AlertDialogAction
            disabled={activate.isPending}
            onClick={(event) => {
              event.preventDefault()
              void handleMode('migrate')
            }}
          >
            {t('boundary.migrate')}
          </AlertDialogAction>
          <Button
            type="button"
            variant="outline"
            disabled={activate.isPending}
            onClick={() => void handleMode('leave-main')}
          >
            {t('boundary.leaveMain')}
          </Button>
          <AlertDialogCancel
            disabled={activate.isPending}
            onClick={(event) => {
              event.preventDefault()
              void handleMode('cancel')
            }}
          >
            {t('boundary.cancelIsolate')}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
