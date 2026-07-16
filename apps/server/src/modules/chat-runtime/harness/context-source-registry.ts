import type { RuntimeHarnessFragment } from '@cradle/chat-runtime-contracts'
import type { Session } from '@cradle/db'

export interface HarnessContextSource {
  key: string
  resolve: (session: Session) => RuntimeHarnessFragment | null
}

const sources = new Map<string, HarnessContextSource>()

export function registerHarnessContextSource(source: HarnessContextSource): void {
  sources.set(source.key, source)
}

export function resolveHarnessContextFragments(session: Session): RuntimeHarnessFragment[] {
  return [...sources.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, source]) => {
      const fragment = source.resolve(session)
      return fragment ? [fragment] : []
    })
}
