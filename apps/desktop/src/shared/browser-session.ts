const BROWSER_SESSION_PARTITION = 'persist:cradle-browser'

/**
 * Encode an owner id into a partition-safe token.
 *
 * Electron sandboxed preloads ship a Buffer polyfill that only supports classic
 * Node encodings (utf8/base64/hex/...). `base64url` throws
 * "Unknown encoding: base64url" there, so we derive the URL-safe form from
 * standard base64. Output matches Node's `Buffer#toString('base64url')`.
 */
function encodeOwnerIdForPartition(ownerId: string): string {
  return Buffer.from(ownerId, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

export function browserSessionPartition(ownerId: string): string {
  return `${BROWSER_SESSION_PARTITION}-${encodeOwnerIdForPartition(ownerId)}`
}
