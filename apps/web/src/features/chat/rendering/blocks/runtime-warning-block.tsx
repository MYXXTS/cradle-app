import type { RuntimeWarningPartData } from '@cradle/chat-runtime-contracts'
import { RightSmallLine as ChevronRightIcon, WarningLine as WarningIcon } from '@mingcute/react'

export function RuntimeWarningBlock({ warning }: { warning: RuntimeWarningPartData }) {
  if (!warning.additionalDetails) {
    return (
      <div className="my-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <WarningIcon className="size-3.5 shrink-0 !text-amber-500" aria-hidden />
        <span className="text-pretty">{warning.message}</span>
      </div>
    )
  }

  return (
    <details className="group my-0.5 text-[12px] text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-0.5 transition-[color] duration-150 hover:text-foreground">
        <WarningIcon className="size-3.5 shrink-0 !text-amber-500" aria-hidden />
        <span className="min-w-0 flex-1 text-pretty">{warning.message}</span>
        <ChevronRightIcon
          className="size-3 shrink-0 transition-transform duration-150 group-open:rotate-90"
          aria-hidden
        />
      </summary>
      <div className="ml-1.5 mt-0.5 border-l border-amber-500/20 py-1 pl-3 text-[11px] leading-relaxed whitespace-pre-wrap wrap-break-word text-muted-foreground/80">
        {warning.additionalDetails}
      </div>
    </details>
  )
}
