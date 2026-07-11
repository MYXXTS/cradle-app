import { useEffect, useState } from 'react'

/**
 * Debounce a fast-changing value (e.g. a search input) so downstream network
 * queries don't fire on every keystroke. The palette's local file/chronicle
 * searches already debounce internally; this is for the server-backed thread
 * and issue searches.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(setDebounced, delayMs, value)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
