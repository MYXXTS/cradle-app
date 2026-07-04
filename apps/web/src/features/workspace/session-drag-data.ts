/**
 * Drag payload format used when a session item is dragged out of the
 * sidebar. The value transferred is the plain session id.
 *
 * Consumers: Electron tear-off (native drop target) and the chat split
 * workspace (dropping a session into the main content area to open a new
 * split pane).
 */
export const SESSION_DRAG_MIME_TYPE = 'application/x-cradle-session'

export function readDraggedSessionId(dataTransfer: DataTransfer | null): string | null {
  return dataTransfer?.getData(SESSION_DRAG_MIME_TYPE) || null
}

export function isSessionDragEvent(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false
  }
  return Array.from(dataTransfer.types).includes(SESSION_DRAG_MIME_TYPE)
}
