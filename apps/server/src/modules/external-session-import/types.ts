import type { UIMessage } from 'ai'

export type ExternalSessionSourceApp = 'claude' | 'codex'

export interface ExternalSessionGitIdentity {
  originUrl: string | null
  repoRoot: string | null
  branch: string | null
  headSha: string | null
}

export interface ExternalSessionDescriptor {
  candidateId: string
  sourceHostId: string
  sourceApp: ExternalSessionSourceApp
  externalSessionId: string
  sourcePath: string | null
  sourceRevision: string
  title: string
  summary: string | null
  workspacePath: string
  gitIdentity: ExternalSessionGitIdentity
  createdAt: number | null
  updatedAt: number | null
  archived: boolean
  estimatedBytes: number | null
  childSessionCount: number | null
}

export interface ExternalSessionImportMessage {
  sourceEntryIds: string[]
  createdAt: number | null
  message: UIMessage
}

export interface ExternalSessionFidelityReport {
  messages: number
  toolCalls: number
  reasoningParts: number
  omittedSystemEntries: number
  unavailableAttachments: number
  childSessions: number
}

export interface ExternalSessionReadResult {
  descriptor: ExternalSessionDescriptor
  contentHash: string
  messages: ExternalSessionImportMessage[]
  fidelity: ExternalSessionFidelityReport
}

export interface ExternalSessionDiscoverInput {
  sourceHostId: string
  limit?: number
}

export interface ExternalSessionReadInput {
  descriptor: ExternalSessionDescriptor
}

export interface ExternalSessionSourceAdapter {
  readonly sourceApp: ExternalSessionSourceApp
  discover: (input: ExternalSessionDiscoverInput) => Promise<ExternalSessionDescriptor[]>
  read: (input: ExternalSessionReadInput) => Promise<ExternalSessionReadResult>
}
