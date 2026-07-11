import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

import ts from 'typescript'

const sourceRoot = resolve(import.meta.dirname, '../src')
const MAX_DIRECT_API_GEN_IMPORTS = 186
const MIGRATED_FEATURE_FILES = new Set([
  'features/session/use-session-pull-request.ts',
  'features/settings/use-app-preferences.ts',
  'features/settings/use-chat-preferences.ts',
  'features/settings/use-codex-preferences.ts',
  'features/settings/use-desktop-preferences.ts',
  'features/settings/use-network-preferences.ts',
])
const RAW_FETCH_BASELINE = new Map<string, number>([
  ['features/assets/assets-api.ts', 1],
  ['features/automation/api-client.ts', 1],
  ['features/changelog/use-changelog.ts', 2],
  ['features/chat/commands/chat-response-command.ts', 3],
  ['features/chat/ui/chat-share-export.tsx', 1],
  ['features/chronicle/use-chronicle.ts', 1],
  ['features/desktop-tray/api.ts', 1],
  ['features/devtool/health/health-panel.tsx', 1],
  ['features/devtool/observability/use-observability-events.ts', 2],
  ['features/devtool/plugins/use-plugin-data.ts', 1],
  ['features/search/use-chronicle-search.ts', 1],
  ['features/settings/external-work-import-settings.tsx', 1],
  ['features/settings/server-endpoint-settings.tsx', 1],
  ['features/settings/worktree-settings.tsx', 1],
  ['features/workspace/workspace-pdf-preview.tsx', 1],
  ['lib/observability-client.ts', 1],
  ['lib/plugin-host.ts', 2],
  ['lib/server-credential.ts', 1],
])

function listSourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      if (name !== 'api-gen') {
        files.push(...listSourceFiles(path))
      }
    }
    else if (/\.(?:ts|tsx)$/.test(name)) {
      files.push(path)
    }
  }
  return files
}

const directImports: Array<{ file: string, specifier: string }> = []
const rawFetchCounts = new Map<string, number>()
const violations: string[] = []

for (const file of listSourceFiles(sourceRoot)) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const filePath = relative(sourceRoot, file).split(sep).join('/')
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'fetch'
    ) {
      rawFetchCounts.set(filePath, (rawFetchCounts.get(filePath) ?? 0) + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue
    }
    const specifier = statement.moduleSpecifier.text
    if (!specifier.includes('api-gen')) {
      continue
    }
    if (!filePath.includes('/api/')) {
      directImports.push({ file: filePath, specifier })
    }
    if (MIGRATED_FEATURE_FILES.has(filePath)) {
      violations.push(`${filePath} imports ${specifier}; migrated features must import their api/ gateway`)
    }
  }
}

for (const [filePath, count] of rawFetchCounts) {
  const baseline = RAW_FETCH_BASELINE.get(filePath)
  if (baseline === undefined) {
    violations.push(`${filePath} calls raw fetch(); use an api/ gateway or add a reviewed transport exception`)
  }
  else if (count > baseline) {
    violations.push(`${filePath} raw fetch() calls grew from baseline ${baseline} to ${count}`)
  }
}

if (directImports.length > MAX_DIRECT_API_GEN_IMPORTS) {
  violations.push(
    `direct api-gen imports grew from baseline ${MAX_DIRECT_API_GEN_IMPORTS} to ${directImports.length}`,
  )
}

if (violations.length > 0) {
  throw new Error(`Web API boundary violations:\n${violations.map(value => `- ${value}`).join('\n')}`)
}

const rawFetchTotal = [...rawFetchCounts.values()].reduce((total, count) => total + count, 0)
if (process.env.CRADLE_API_BOUNDARY_DEBUG === '1') {
  for (const [filePath, count] of [...rawFetchCounts].toSorted(([left], [right]) => left.localeCompare(right))) {
    console.warn(`${filePath}: raw fetch() x${count}`)
  }
}
console.warn(`Web API boundary check passed; non-gateway api-gen imports: ${directImports.length}/${MAX_DIRECT_API_GEN_IMPORTS}; approved raw fetch calls: ${rawFetchTotal}`)
