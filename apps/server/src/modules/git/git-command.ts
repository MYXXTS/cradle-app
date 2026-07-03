import { spawn } from 'node:child_process'

export async function runGitCommand(
  cwd: string,
  args: string[],
  allowedExitCodes: number[] = [],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => {
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      const output = Buffer.concat(stdout).toString('utf8')
      const exitCode = code ?? 0
      if (exitCode === 0 || allowedExitCodes.includes(exitCode)) {
        resolve(output)
        return
      }

      const errorOutput = Buffer.concat(stderr).toString('utf8').trim()
      const message = errorOutput || `git ${args[0] ?? 'command'} exited with code ${exitCode}`
      reject(Object.assign(new Error(message), { code: exitCode, stdout: output }))
    })
  })
}
