import { beforeEach, describe, expect, it, vi } from 'vitest'

const childProcessMocks = vi.hoisted(() => {
  const execFile = vi.fn()
  const promisifiedExecFile = vi.fn(async (file: string, args: string[]) => {
    if (args.includes('--display')) {
      return {
        stdout: '',
        stderr: 'designated => anchor apple generic and identifier "com.cradle.app"\n',
      }
    }
    return { stdout: '', stderr: '' }
  })
  Object.defineProperty(execFile, Symbol.for('nodejs.util.promisify.custom'), {
    configurable: true,
    value: promisifiedExecFile,
  })
  return { execFile, promisifiedExecFile }
})

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return { ...actual, execFile: childProcessMocks.execFile }
})

describe('macOS desktop update bundle verifier', () => {
  beforeEach(() => {
    childProcessMocks.promisifiedExecFile.mockReset()
    childProcessMocks.promisifiedExecFile.mockImplementation(async (_file: string, args: string[]) => {
      if (args.includes('--display')) {
        return {
          stdout: '',
          stderr: 'designated => anchor apple generic and identifier "com.cradle.app"\n',
        }
      }
      return { stdout: '', stderr: '' }
    })
  })

  it('verifies the staged app against the current app designated requirement', async () => {
    const { MacOSDesktopUpdateBundleVerifier } = await import('./update-bundle-verifier')
    const verifier = new MacOSDesktopUpdateBundleVerifier()

    await verifier.verify('/staging/Cradle.app', '/Applications/Cradle.app')

    expect(childProcessMocks.promisifiedExecFile).toHaveBeenNthCalledWith(1, '/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      '--verbose=2',
      '/Applications/Cradle.app',
    ])
    expect(childProcessMocks.promisifiedExecFile).toHaveBeenNthCalledWith(2, '/usr/bin/codesign', [
      '--display',
      '-r-',
      '/Applications/Cradle.app',
    ])
    expect(childProcessMocks.promisifiedExecFile).toHaveBeenNthCalledWith(3, '/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      '--verbose=2',
      '-R=anchor apple generic and identifier "com.cradle.app"',
      '/staging/Cradle.app',
    ])
  })

  it('fails closed when the current app has no designated requirement', async () => {
    childProcessMocks.promisifiedExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })
    childProcessMocks.promisifiedExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })
    const { MacOSDesktopUpdateBundleVerifier } = await import('./update-bundle-verifier')

    await expect(new MacOSDesktopUpdateBundleVerifier().verify(
      '/staging/Cradle.app',
      '/Applications/Cradle.app',
    )).rejects.toThrow('Current app does not expose a designated requirement')
  })
})
