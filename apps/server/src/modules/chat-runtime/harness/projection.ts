import type { RuntimeHarnessContext } from '../runtime-provider-types'

export function appendHarnessFragmentsToSystemPrompt(
  systemPrompt: string | undefined,
  harness: RuntimeHarnessContext | undefined,
): string | undefined {
  const fragments = harness?.fragments.map(fragment => fragment.content) ?? []
  if (fragments.length === 0) {
    return systemPrompt
  }
  return [systemPrompt, ...fragments].filter(Boolean).join('\n\n---\n\n')
}
