import { describe, expect, it } from 'vitest'

import { isBase64Like, parseProviderConfig, tryDecodeBase64 } from './import-provider-parser'

function encodeBase64(text: string): string {
  return btoa(text)
}

describe('parseProviderConfig', () => {
  it('parses base64-encoded JSON provider snippets', () => {
    const result = parseProviderConfig(encodeBase64(JSON.stringify({
      apiKey: 'sk-test-json',
      baseUrl: 'https://gateway.example.test/v1',
    })))

    expect(result.token).toBe('sk-test-json')
    expect(result.urls).toEqual([
      { url: 'https://gateway.example.test/v1', kind: 'openai-compatible' },
    ])
    expect(result.providers).toEqual([
      {
        providerKind: 'openai-compatible',
        name: 'gateway.example.test',
        apiKey: 'sk-test-json',
        baseUrl: 'https://gateway.example.test/v1',
      },
    ])
  })

  it('parses base64-encoded export provider snippets', () => {
    const result = parseProviderConfig(encodeBase64([
      'export OPENAI_API_KEY=sk-test-export',
      'export OPENAI_BASE_URL=https://openai.example.test/v1',
    ].join('\n')))

    expect(result.token).toBe('sk-test-export')
    expect(result.providers).toEqual([
      {
        providerKind: 'openai-compatible',
        name: 'openai.example.test',
        apiKey: 'sk-test-export',
        baseUrl: 'https://openai.example.test/v1',
      },
    ])
  })

  it('parses base64-encoded labeled provider snippets without including labels in the token', () => {
    const result = parseProviderConfig('5Luk54mMc2stV1VsYld3dmdoeFpUWHVaS2k1NmlFcXJRVVk4MDU1VzRaa0N2c3VhQXNrbTNISHc55Zyw5Z2AaHR0cHM6Ly93d3cuc3VwZXJ0b2tlbi5sb2wvdjEvbWVzc2FnZXPmqKHlnovlkI1NaW5pTWF4LU0z')

    expect(result.token).toBe('sk-WUlbWwvghxZTXuZKi56iEqrQUY8055W4ZkCvsuaAskm3HHw9')
    expect(result.providers).toEqual([
      {
        providerKind: 'openai-compatible',
        name: 'www.supertoken.lol',
        apiKey: 'sk-WUlbWwvghxZTXuZKi56iEqrQUY8055W4ZkCvsuaAskm3HHw9',
        baseUrl: 'https://www.supertoken.lol/v1/messages',
      },
    ])
  })

  it('does not auto-decode base64 API keys without known prefixes', () => {
    const base64Key = encodeBase64('my-secret-key-value')
    const result = parseProviderConfig(`https://api.example.com/v1 ${base64Key}`)

    expect(result.token).toBe(base64Key)
    expect(result.providers[0]?.apiKey).toBe(base64Key)
  })

  it('preserves API keys with known prefixes as-is', () => {
    const result = parseProviderConfig('https://api.example.com/v1 sk-test-key-12345')

    expect(result.token).toBe('sk-test-key-12345')
    expect(result.providers[0]?.apiKey).toBe('sk-test-key-12345')
  })
})

describe('isBase64Like', () => {
  it('returns true for base64 strings without known prefixes', () => {
    expect(isBase64Like(encodeBase64('some secret value'))).toBe(true)
  })

  it('returns false for strings with known API key prefixes', () => {
    expect(isBase64Like('sk-test-key-12345')).toBe(false)
    expect(isBase64Like('sk-ant-api-key-12345')).toBe(false)
    expect(isBase64Like('tp-something-12345')).toBe(false)
  })

  it('returns false for strings shorter than 16 chars', () => {
    expect(isBase64Like(encodeBase64('short'))).toBe(false)
  })

  it('returns false for non-base64 strings', () => {
    expect(isBase64Like('not base64 at all!')).toBe(false)
  })
})

describe('tryDecodeBase64', () => {
  it('decodes a base64 string', () => {
    expect(tryDecodeBase64(encodeBase64('hello world'))).toBe('hello world')
  })

  it('returns original string if not base64', () => {
    expect(tryDecodeBase64('sk-test-key-12345')).toBe('sk-test-key-12345')
  })

  it('can decode multiple layers', () => {
    const layer1 = encodeBase64('secret-value')
    const layer2 = encodeBase64(layer1)
    expect(tryDecodeBase64(layer2)).toBe(layer1)
  })
})
