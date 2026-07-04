import type { ChatSplitDirection } from './chat-split-workspace-store'

/**
 * Direction a flat (pre-split) drop can resolve to. Unlike `dockview`'s own
 * group drop-overlay — which reserves a center zone for "merge as tab" —
 * there is no existing tab strip to merge into yet, so `'within'` is
 * intentionally excluded: every drop on the flat pane must produce a real
 * split.
 */
export type FlatSplitDirection = Exclude<ChatSplitDirection, 'within'>

/**
 * Resolves a raw pointer position into a split direction by partitioning the
 * drop target along its diagonals into four triangles. This covers the
 * entire area with no dead center zone, so dropping anywhere on the flat
 * pane — including the middle, where users naturally aim when dragging a
 * session "into the main area" — always creates a side-by-side (or
 * top/bottom) split instead of silently merging into a hidden tab.
 */
export function directionFromDropPoint(
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  point: { clientX: number, clientY: number },
): FlatSplitDirection {
  const dx = (point.clientX - bounds.left) / bounds.width - 0.5
  const dy = (point.clientY - bounds.top) / bounds.height - 0.5

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left'
  }
  return dy > 0 ? 'below' : 'above'
}
