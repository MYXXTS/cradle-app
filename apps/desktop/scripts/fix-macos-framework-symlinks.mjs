#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import path, { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function inferFrameworkLocalTarget(frameworkDir, frameworkName, rawTarget) {
  if (!path.isAbsolute(rawTarget)) {
    return null
  }

  if (rawTarget.startsWith(`${frameworkDir}/`)) {
    const target = join(frameworkDir, rawTarget.slice(frameworkDir.length + 1))
    return existsSync(target) ? target : null
  }

  const marker = `/${frameworkName}/`
  const markerIndex = rawTarget.lastIndexOf(marker)
  if (markerIndex < 0) {
    return null
  }

  const target = join(frameworkDir, rawTarget.slice(markerIndex + marker.length))
  return existsSync(target) ? target : null
}

function rewriteSymlink(linkPath, targetPath) {
  const nextTarget = relative(dirname(linkPath), targetPath) || '.'
  unlinkSync(linkPath)
  symlinkSync(nextTarget, linkPath)
}

function visitFrameworkSymlinks(frameworkDir, visitor) {
  for (const entry of readdirSync(frameworkDir, { withFileTypes: true })) {
    const entryPath = join(frameworkDir, entry.name)
    const entryStat = lstatSync(entryPath)

    if (entryStat.isSymbolicLink()) {
      visitor(entryPath, readlinkSync(entryPath))
      continue
    }

    if (entryStat.isDirectory()) {
      visitFrameworkSymlinks(entryPath, visitor)
    }
  }
}

export function fixMacOSFrameworkSymlinks(appPath, options = {}) {
  const resolvedAppPath = resolve(appPath)
  const frameworksDir = join(resolvedAppPath, 'Contents', 'Frameworks')
  const result = {
    rewritten: 0,
    absoluteSymlinks: [],
  }

  if (!existsSync(frameworksDir)) {
    return result
  }

  for (const entry of readdirSync(frameworksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.framework')) {
      continue
    }

    const frameworkDir = join(frameworksDir, entry.name)
    visitFrameworkSymlinks(frameworkDir, (linkPath, rawTarget) => {
      if (!path.isAbsolute(rawTarget)) {
        return
      }

      const localTarget = inferFrameworkLocalTarget(frameworkDir, entry.name, rawTarget)
      if (localTarget && !options.checkOnly) {
        rewriteSymlink(linkPath, localTarget)
        result.rewritten += 1
        return
      }

      result.absoluteSymlinks.push({ linkPath, target: rawTarget })
    })
  }

  return result
}

function printAbsoluteSymlinks(symlinks) {
  for (const symlink of symlinks) {
    console.error(`${symlink.linkPath} -> ${symlink.target}`)
  }
}

function runCli() {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')
  const appPath = args.find(arg => arg !== '--check')

  if (!appPath) {
    console.error('Usage: fix-macos-framework-symlinks.mjs <Cradle.app> [--check]')
    process.exit(1)
  }

  const result = fixMacOSFrameworkSymlinks(appPath, { checkOnly })
  if (result.absoluteSymlinks.length > 0) {
    console.error('Found absolute macOS framework symlinks:')
    printAbsoluteSymlinks(result.absoluteSymlinks)
    process.exit(1)
  }

  if (!checkOnly && result.rewritten > 0) {
    console.warn(`[desktop] Rewrote ${result.rewritten} macOS framework symlink(s).`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli()
}
