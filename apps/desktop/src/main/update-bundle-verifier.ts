import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface DesktopUpdateBundleVerifier {
  verify: (stagedAppPath: string, currentAppPath: string) => Promise<void>
}

export class MacOSDesktopUpdateBundleVerifier implements DesktopUpdateBundleVerifier {
  async verify(stagedAppPath: string, currentAppPath: string): Promise<void> {
    try {
      await execFileAsync('/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        '--verbose=2',
        currentAppPath,
      ])
      const { stderr } = await execFileAsync('/usr/bin/codesign', [
        '--display',
        '-r-',
        currentAppPath,
      ])
      const designatedRequirement = readDesignatedRequirement(stderr)
      await execFileAsync('/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        '--verbose=2',
        `-R=${designatedRequirement}`,
        stagedAppPath,
      ])
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Desktop update bundle signature verification failed: ${message}`)
    }
  }
}

function readDesignatedRequirement(output: string): string {
  const requirement = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.startsWith('designated =>'))
    ?.slice('designated =>'.length)
    .trim()

  if (!requirement) {
    throw new Error('Current app does not expose a designated requirement')
  }
  return requirement
}
