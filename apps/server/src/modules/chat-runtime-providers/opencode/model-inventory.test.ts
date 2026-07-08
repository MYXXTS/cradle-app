import type { ProviderListResponse } from '@opencode-ai/sdk'
import { describe, expect, it } from 'vitest'

import { flattenOpenCodeProviders } from './model-inventory'

describe('flattenOpenCodeProviders', () => {
  it('projects opencode reasoning models with supported per-turn variants', () => {
    const providers = [{
      api: 'openai',
      name: 'OpenAI',
      env: [],
      id: 'openai',
      models: {
        'gpt-5': {
          id: 'gpt-5',
          name: 'GPT-5',
          release_date: '2026-01-01',
          attachment: false,
          reasoning: true,
          temperature: false,
          tool_call: true,
          limit: { context: 400000, output: 128000 },
          modalities: { input: ['text'], output: ['text'] },
          options: {},
        },
      },
    }] satisfies ProviderListResponse['all']

    expect(flattenOpenCodeProviders({
      runtimeKind: 'opencode',
      providers,
    })[0]?.capabilities).toMatchObject({
      reasoning: true,
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    })
  })
})
