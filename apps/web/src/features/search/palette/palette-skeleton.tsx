import { createPortal } from 'react-dom'

import { Skeleton } from '~/components/ui/skeleton'

/**
 * First-open skeleton. The palette dialog is lazy-loaded, so the very first
 * <kbd>⌘K</kbd> would otherwise paint nothing while the chunk downloads. This
 * portals a frame that matches the real panel's shape, then the loaded dialog
 * swaps in on top of it. An idle-time preload in `app-shell` means this only
 * ever shows for a truly cold open.
 */
export function PaletteSkeleton() {
  return createPortal(
    <div className="fixed inset-0 isolate z-50 flex items-start justify-center px-4 pt-[16vh]">
      <div className="w-full max-w-[640px] overflow-hidden rounded-2xl bg-popover/92 ring-1 ring-foreground/[0.06] backdrop-blur-xl">
        <div className="flex h-12 items-center gap-2.5 px-4">
          <Skeleton className="size-[17px] rounded-full" />
          <Skeleton className="h-3.5 w-44 rounded-full" />
        </div>
        <div className="flex items-center gap-1 border-b border-foreground/[0.05] px-2.5 py-2 dark:border-white/[0.05]">
          <Skeleton className="h-6 w-12 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="space-y-0.5 p-1.5">
          {['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6'].map(key => (
            <div key={key} className="flex items-center gap-2.5 px-2.5 py-1">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3.5 flex-1 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
