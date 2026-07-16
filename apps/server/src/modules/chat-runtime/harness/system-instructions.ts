import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let cachedInstructions: string | null | undefined

export function getCradleHarnessSystemInstructions(): string | null {
  if (cachedInstructions !== undefined) {
    return cachedInstructions
  }

  for (const skillFile of resolveCradleCliSkillCandidates()) {
    if (!existsSync(skillFile)) {
      continue
    }
    const skill = readFileSync(skillFile, 'utf-8').trim()
    cachedInstructions = [
      '# Cradle Runtime Identity',
      '',
      'The following Cradle CLI skill is permanently active for this session.',
      '',
      skill,
    ].join('\n')
    return cachedInstructions
  }

  cachedInstructions = null
  return null
}

function resolveCradleCliSkillCandidates(): string[] {
  const configuredRoot = process.env.CRADLE_BUILTIN_SKILLS_DIR?.trim()
  return [
    ...(configuredRoot ? [resolve(configuredRoot, 'cradle-cli', 'SKILL.md')] : []),
    resolve(process.cwd(), '../../../resources/skills/cradle-cli/SKILL.md'),
    resolve(process.cwd(), '../../resources/skills/cradle-cli/SKILL.md'),
    resolve(process.cwd(), '../resources/skills/cradle-cli/SKILL.md'),
    resolve(process.cwd(), 'resources/skills/cradle-cli/SKILL.md'),
  ]
}
