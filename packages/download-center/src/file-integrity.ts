import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export type FileChecksumAlgorithm = 'sha256' | 'sha512'

export const computeFileChecksum = async (filePath: string, algorithm: FileChecksumAlgorithm): Promise<string> => {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}
