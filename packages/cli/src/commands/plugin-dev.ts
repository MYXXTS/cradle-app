import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parseCradlePluginPackageJsonText } from '@cradle/plugin-sdk/manifest'
import type { Command } from 'commander'
import { build, type InlineConfig, type Plugin, type Rollup } from 'vite'
import { z } from 'zod'

import { getCommandContext } from '../runtime/context'

const layerNames = ['server', 'web', 'desktop'] as const
type PluginLayer = typeof layerNames[number]

const PluginDevSessionSchema = z.object({
  id: z.string().min(1),
  pluginName: z.string().min(1),
  displayName: z.string().min(1),
  revisions: z.object({
    server: z.number().int().nonnegative(),
    web: z.number().int().nonnegative(),
    desktop: z.number().int().nonnegative(),
  }),
})

interface LayerBuild {
  layer: PluginLayer
  outputEntry: string
  sourceEntry: string
}

interface LayerWatcher {
  build: LayerBuild
  close: () => Promise<void>
  initialBuild: Promise<void>
}

interface PluginDevOptions {
  packageDir?: string
}

function findChild(parent: Command, name: string): Command | undefined {
  return parent.commands.find(command => command.name() === name)
}

function readChild(parent: Command, name: string, description: string): Command {
  return findChild(parent, name) ?? parent.command(name).description(description)
}

function isBareImport(id: string): boolean {
  return !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0')
}

function injectWebCss(): Plugin {
  return {
    name: 'cradle-plugin-dev-inject-css',
    generateBundle(_options, bundle) {
      const cssAssets = Object.values(bundle).filter(
        (output): output is Rollup.OutputAsset => output.type === 'asset' && output.fileName.endsWith('.css'),
      )
      if (cssAssets.length === 0) { return }
      const css = cssAssets.map(asset => String(asset.source)).join('\n')
      const injection = [
        `const __cradleStyle = document.createElement('style');`,
        `__cradleStyle.dataset.cradlePluginDevStyle = import.meta.url;`,
        `__cradleStyle.textContent = ${JSON.stringify(css)};`,
        `document.head.appendChild(__cradleStyle);`,
        `export const __cradleDevDispose = () => __cradleStyle.remove();`,
      ].join('\n')
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && output.isEntry) {
          output.code = `${injection}\n${output.code}`
        }
      }
      for (const asset of cssAssets) {
        delete bundle[asset.fileName]
      }
    },
  }
}

function createBuildConfig(packageDir: string, layerBuild: LayerBuild): InlineConfig {
  const outputDir = resolve(packageDir, '.cradle/dev')
  const common = {
    configFile: false as const,
    root: packageDir,
    logLevel: 'silent' as const,
    build: {
      emptyOutDir: false,
      minify: false,
      outDir: outputDir,
      sourcemap: true,
      target: 'es2022' as const,
      watch: {},
    },
  }

  if (layerBuild.layer === 'web') {
    return {
      ...common,
      plugins: [injectWebCss()],
      build: {
        ...common.build,
        lib: {
          entry: resolve(packageDir, layerBuild.sourceEntry),
          formats: ['es'],
        },
        rollupOptions: {
          external: [
            'react',
            'react-dom',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'react-dom/client',
          ],
          output: {
            entryFileNames: `${layerBuild.layer}.mjs`,
          },
        },
      },
    }
  }

  return {
    ...common,
    build: {
      ...common.build,
      ssr: resolve(packageDir, layerBuild.sourceEntry),
      rollupOptions: {
        external: (id: string) => isBareImport(id),
        output: {
          entryFileNames: `${layerBuild.layer}.mjs`,
        },
      },
      target: 'node22',
    },
  }
}

async function startLayerWatcher(
  packageDir: string,
  layerBuild: LayerBuild,
  onRebuild: (build: LayerBuild, durationMs: number) => Promise<void>,
): Promise<LayerWatcher> {
  const result = await build(createBuildConfig(packageDir, layerBuild))
  if (!('on' in result)) {
    throw new Error(`Vite did not create a watcher for the ${layerBuild.layer} layer.`)
  }
  const watcher = result as Rollup.RollupWatcher
  let initialComplete = false
  let resolveInitial!: () => void
  let rejectInitial!: (error: Error) => void
  const initialBuild = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveInitial = resolvePromise
    rejectInitial = rejectPromise
  })

  watcher.on('event', (event) => {
    if (event.code === 'BUNDLE_END') {
      const durationMs = event.duration
      void event.result.close()
      if (!initialComplete) {
        initialComplete = true
        resolveInitial()
        return
      }
      void onRebuild(layerBuild, durationMs)
      return
    }
    if (event.code === 'ERROR') {
      const error = event.error instanceof Error ? event.error : new Error(String(event.error))
      if (!initialComplete) {
        initialComplete = true
        rejectInitial(error)
      }
      console.error(`[plugin dev] ${layerBuild.layer} build failed: ${error.message}`)
    }
  })

  return {
    build: layerBuild,
    close: () => watcher.close(),
    initialBuild,
  }
}

function createLayerBuilds(dev: {
  server?: string
  web?: string
  desktop?: string
}): LayerBuild[] {
  return layerNames.flatMap((layer) => {
    const sourceEntry = dev[layer]
    return sourceEntry
      ? [{ layer, sourceEntry, outputEntry: `.cradle/dev/${layer}.mjs` }]
      : []
  })
}

async function runPluginDev(command: Command, options: PluginDevOptions): Promise<void> {
  const packageDir = resolve(options.packageDir ?? process.cwd())
  const parsed = parseCradlePluginPackageJsonText(await readFile(resolve(packageDir, 'package.json'), 'utf8'))
  const builds = createLayerBuilds(parsed.cradle.dev ?? {})
  if (builds.length === 0) {
    throw new Error('Plugin package must declare at least one explicit cradle.dev entry.')
  }

  const context = getCommandContext(command)
  let session: z.infer<typeof PluginDevSessionSchema> | null = null
  let reloadQueue = Promise.resolve()
  const onRebuild = async (layerBuild: LayerBuild, durationMs: number): Promise<void> => {
    if (!session) { return }
    reloadQueue = reloadQueue.then(async () => {
      const result = await context.request({
        method: 'post',
        path: { id: session!.id },
        query: {},
        body: { layer: layerBuild.layer },
        template: '/plugins/dev-sessions/{id}/reload',
      })
      session = PluginDevSessionSchema.parse(result)
      console.log(`${layerBuild.layer} rebuilt in ${Math.round(durationMs)}ms; reloaded revision ${session.revisions[layerBuild.layer]}`)
    }).catch((error: unknown) => {
      console.error(`[plugin dev] reload failed: ${error instanceof Error ? error.message : String(error)}`)
    })
    await reloadQueue
  }

  console.log(`Cradle plugin dev: ${parsed.cradle.displayName ?? parsed.name}`)
  const watchers: LayerWatcher[] = []
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let resolveSignal!: () => void
  const stopped = new Promise<void>(resolvePromise => { resolveSignal = resolvePromise })
  const stop = (): void => resolveSignal()

  try {
    for (const layerBuild of builds) {
      watchers.push(await startLayerWatcher(packageDir, layerBuild, onRebuild))
    }
    await Promise.all(watchers.map(watcher => watcher.initialBuild))
    console.log(`built ${builds.map(item => item.layer).join(', ')}`)
    session = PluginDevSessionSchema.parse(await context.request({
      method: 'post',
      path: {},
      query: {},
      body: {
        packageDir,
        entries: Object.fromEntries(builds.map(item => [item.layer, item.outputEntry])),
      },
      template: '/plugins/dev-sessions',
    }))
    console.log(`connected to Cradle at ${context.serverUrl}`)
    console.log(`activated ${session.pluginName}`)

    heartbeat = setInterval(() => {
      if (!session) { return }
      void context.request({
        method: 'post',
        path: { id: session.id },
        query: {},
        template: '/plugins/dev-sessions/{id}/heartbeat',
      }).catch((error: unknown) => {
        console.error(`[plugin dev] heartbeat failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }, 10_000)
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    await stopped
  }
  finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    if (heartbeat) { clearInterval(heartbeat) }
    await Promise.allSettled(watchers.map(watcher => watcher.close()))
    await reloadQueue
    if (session) {
      await context.request({
        method: 'delete',
        path: { id: session.id },
        query: {},
        template: '/plugins/dev-sessions/{id}',
      }).catch(() => undefined)
      console.log(`deactivated ${session.pluginName}`)
    }
  }
}

export function registerPluginDevCommand(root: Command): void {
  const plugin = readChild(root, 'plugin', 'Manage plugins')
  plugin
    .command('dev')
    .description('Build and temporarily load a plugin in the running Cradle Desktop app')
    .option('--package-dir <path>', 'Plugin package directory. Defaults to the current directory')
    .action(async (options: PluginDevOptions, command: Command) => runPluginDev(command, options))
}

export const pluginDevInternals = {
  createBuildConfig,
  createLayerBuilds,
}
