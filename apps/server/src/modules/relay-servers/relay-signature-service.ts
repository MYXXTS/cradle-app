import { randomUUID } from 'node:crypto'

import { ed25519 } from '@noble/curves/ed25519'

export type RelayAssertionRole = 'host' | 'controller'
export type RelayAssertionPurpose = 'create_room' | 'claim' | 'reconnect' | 'ws'

export interface RelaySigningKeyPair {
  privateKeyBase64: string
  publicKeyBase64: string
}

export interface RelayAssertion {
  pubkey: string
  role: RelayAssertionRole
  roomId: string
  purpose: RelayAssertionPurpose
  pairingCode?: string
  controllerPubkey?: string
  issuedAt: number
  nonce: string
}

export interface SignedRelayAssertion {
  assertion: RelayAssertion
  signature: string
}

export function createRelayRoomId(): string {
  return `room_${randomUUID()}`
}

export function generateRelaySigningKeyPair(): RelaySigningKeyPair {
  const privateKey = ed25519.utils.randomPrivateKey()
  const publicKey = ed25519.getPublicKey(privateKey)
  return {
    privateKeyBase64: bytesToBase64(privateKey),
    publicKeyBase64: bytesToBase64(publicKey),
  }
}

export function relaySigningPublicKeyFromPrivate(privateKeyBase64: string): string {
  return bytesToBase64(ed25519.getPublicKey(base64ToBytes(privateKeyBase64)))
}

export function signRelayAssertion(
  privateKeyBase64: string,
  input: Omit<RelayAssertion, 'pubkey' | 'issuedAt' | 'nonce'>,
): SignedRelayAssertion {
  const privateKey = base64ToBytes(privateKeyBase64)
  const assertion: RelayAssertion = {
    pubkey: relaySigningPublicKeyFromPrivate(privateKeyBase64),
    role: input.role,
    roomId: input.roomId,
    purpose: input.purpose,
    ...(input.pairingCode ? { pairingCode: input.pairingCode } : {}),
    ...(input.controllerPubkey ? { controllerPubkey: input.controllerPubkey } : {}),
    issuedAt: Math.floor(Date.now() / 1000),
    nonce: randomUUID(),
  }
  const payload = Buffer.from(canonicalRelayAssertionJSON(assertion), 'utf8')
  return {
    assertion,
    signature: bytesToBase64(ed25519.sign(payload, privateKey)),
  }
}

export function relayAssertionHeaders(signed: SignedRelayAssertion): Record<string, string> {
  return {
    'X-Cradle-Relay-Assertion': Buffer.from(JSON.stringify(signed.assertion), 'utf8').toString('base64'),
    'X-Cradle-Relay-Signature': signed.signature,
  }
}

function canonicalRelayAssertionJSON(assertion: RelayAssertion): string {
  const fields: Record<string, string | number> = {
    issuedAt: assertion.issuedAt,
    nonce: assertion.nonce,
    pubkey: assertion.pubkey,
    purpose: assertion.purpose,
    role: assertion.role,
    roomId: assertion.roomId,
  }
  if (assertion.pairingCode) {
    fields.pairingCode = assertion.pairingCode
  }
  if (assertion.controllerPubkey) {
    fields.controllerPubkey = assertion.controllerPubkey
  }
  return JSON.stringify(Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))))
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}
