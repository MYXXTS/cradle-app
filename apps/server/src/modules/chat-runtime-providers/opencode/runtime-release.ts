import { z } from 'zod'

import manifestJson from './opencode-runtime-manifest.json'

export type OpencodeArchiveFormat = 'zip' | 'tar.gz'
export type OpencodeLinuxLibc = 'glibc' | 'musl'
const targetKeys = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64-glibc',
  'linux-arm64-musl',
  'linux-x64-glibc',
  'linux-x64-musl',
  'win32-arm64',
  'win32-x64',
] as const
export type OpencodeTargetKey = (typeof targetKeys)[number]

export interface OpencodeReleaseAsset {
  assetName: string
  format: OpencodeArchiveFormat
  sizeBytes: number
  sha256: string
}

const releaseAssetSchema = z.object({
  assetName: z.string().min(1),
  format: z.enum(['zip', 'tar.gz']),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

const runtimeManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sdkVersion: z.string().min(1),
  releaseTag: z.string().min(1),
  repository: z.literal('anomalyco/opencode'),
  targets: z.record(z.enum(targetKeys), releaseAssetSchema),
})

export type OpencodeRuntimeManifest = z.infer<typeof runtimeManifestSchema>

export interface ResolvedOpencodeReleaseTarget extends OpencodeReleaseAsset {
  key: OpencodeTargetKey
  version: string
  releaseTag: string
  downloadUrl: string
  executableName: 'opencode' | 'opencode.exe'
}

export const OPENCODE_RUNTIME_MANIFEST: OpencodeRuntimeManifest = runtimeManifestSchema.parse(manifestJson)

function detectLinuxLibc(): OpencodeLinuxLibc | null {
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined
  return report?.header?.glibcVersionRuntime ? 'glibc' : null
}

export function resolveOpencodeReleaseTarget(input: {
  platform?: NodeJS.Platform
  arch?: string
  libc?: OpencodeLinuxLibc | null
} = {}): ResolvedOpencodeReleaseTarget | null {
  const platform = input.platform ?? process.platform
  const arch = input.arch ?? process.arch
  const libc = input.libc === undefined && platform === 'linux' ? detectLinuxLibc() : input.libc
  const key = platform === 'linux'
    ? libc && (arch === 'arm64' || arch === 'x64') ? `linux-${arch}-${libc}` as OpencodeTargetKey : null
    : (platform === 'darwin' || platform === 'win32') && (arch === 'arm64' || arch === 'x64')
      ? `${platform}-${arch}` as OpencodeTargetKey
      : null
  if (!key) {
    return null
  }
  const asset = OPENCODE_RUNTIME_MANIFEST.targets[key]
  return {
    ...asset,
    key,
    version: OPENCODE_RUNTIME_MANIFEST.sdkVersion,
    releaseTag: OPENCODE_RUNTIME_MANIFEST.releaseTag,
    downloadUrl: `https://github.com/${OPENCODE_RUNTIME_MANIFEST.repository}/releases/download/${OPENCODE_RUNTIME_MANIFEST.releaseTag}/${asset.assetName}`,
    executableName: platform === 'win32' ? 'opencode.exe' : 'opencode',
  }
}
