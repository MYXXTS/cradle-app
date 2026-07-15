import {
  ClipboardLine as ClipboardIcon,
  CloseLine as XIcon,
  EyeLine as EyeIcon,
  RightSmallLine as ChevronRightIcon,
} from '@mingcute/react'
import { m } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '~/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { cn } from '~/lib/cn'

import type { ComposerPastedText } from './pasted-text'
import { readPastedTextTitle } from './pasted-text'

function PastedTextSummary({ pastedText }: { pastedText: ComposerPastedText }) {
  const { t } = useTranslation('chat')
  const title = readPastedTextTitle(pastedText.text) ?? t('pastedText.label')
  const lineCount = t('pastedText.lines', { count: pastedText.lineCount })
  const charCount = t('pastedText.chars', { count: pastedText.charCount })

  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-global)]/10 text-[var(--color-accent-global)] ring-1 ring-[var(--color-accent-global)]/15">
        <ClipboardIcon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {t('pastedText.label')}
        </span>
        <span className="mt-0.5 block truncate text-xs font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {lineCount}
          <span className="px-1" aria-hidden="true">
            ·
          </span>
          {charCount}
        </span>
      </span>
    </span>
  )
}

function PastedTextPreview({ pastedText }: { pastedText: ComposerPastedText }) {
  const { t } = useTranslation('chat')

  return (
    <div className="border-t border-border/60 bg-muted/35 px-3 py-2.5">
      <pre
        aria-label={t('pastedText.preview')}
        className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/70 px-3 py-2 font-mono text-[11px]/5 text-foreground shadow-[var(--shadow-inset-ring)]"
      >
        {pastedText.text}
      </pre>
    </div>
  )
}

export function ComposerPastedTextCard({
  pastedText,
  onRemove,
  onRestore,
}: {
  pastedText: ComposerPastedText
  onRemove: () => void
  onRestore: () => void
}) {
  const { t } = useTranslation('chat')
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 600, damping: 40 }}
      className="w-80 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-background/85 shadow-sm backdrop-blur-sm"
      data-testid="composer-pasted-text-card"
    >
      <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
        <div className="flex items-center gap-1.5 p-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 rounded-xl p-1.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={t('pastedText.restore')}
            onClick={onRestore}
          >
            <PastedTextSummary pastedText={pastedText} />
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                aria-label={previewOpen ? t('pastedText.collapse') : t('pastedText.preview')}
                aria-pressed={previewOpen}
              >
                <EyeIcon className="size-3.5" aria-hidden="true" />
              </Button>
            </CollapsibleTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              aria-label={t('pastedText.remove')}
              onClick={onRemove}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <CollapsibleContent>
          <PastedTextPreview pastedText={pastedText} />
        </CollapsibleContent>
      </Collapsible>
    </m.div>
  )
}

export function HistoryPastedTextCard({ pastedText }: { pastedText: ComposerPastedText }) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className="mt-2 overflow-hidden rounded-xl border border-border/65 bg-background/60 shadow-xs"
        data-testid="history-pasted-text-card"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 p-2.5 text-left transition-colors hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
            aria-label={open ? t('pastedText.collapse') : t('pastedText.expand')}
          >
            <PastedTextSummary pastedText={pastedText} />
            <ChevronRightIcon
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
                open && 'rotate-90',
              )}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <PastedTextPreview pastedText={pastedText} />
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
