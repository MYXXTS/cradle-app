import { kvCache, modelRegistryMappings } from '@cradle/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../infra'
import type { ModelCapabilities, ModelDescriptor } from '../provider-contracts/types'

export interface ModelsDevModel {
  id: string
  name?: string
  limit?: { context?: number, output?: number }
  modalities?: { input?: string[], output?: string[] }
  reasoning?: boolean
  tool_call?: boolean
  temperature?: boolean
  structured_output?: boolean
  cost?: { input?: number, output?: number, cache_read?: number, cache_write?: number }
  family?: string
  knowledge?: string
  release_date?: string
}

export interface ModelRegistryMappingEntry {
  modelId: string
  registryModelId?: string
  matchType?: 'manual' | 'alias'
  model?: ModelsDevModel
  updatedAt?: number
}

export interface ModelRegistrySearchResult {
  id: string
  label: string
  capabilities: ModelCapabilities
}

interface ModelsDevProvider {
  models: Record<string, ModelsDevModel>
}

type ModelsDevData = Record<string, ModelsDevProvider>

const MODELS_DEV_URL = 'https://models.dev/api.json'
const CACHE_KEY = 'models_dev_api_json'
/** Serve cached data without refresh while younger than this. */
const SOFT_TTL_MS = 1000 * 60 * 60 // 1 hour
/** After this age, block on a network refresh (still fall back to stale on failure). */
const HARD_TTL_MS = 1000 * 60 * 60 * 24 // 24 hours

let memCache: ModelsDevData | null = null
/** Wall-clock ms when the in-memory snapshot was fetched from the network. */
let memFetchedAt = 0
let refreshInFlight: Promise<ModelsDevData | null> | null = null
const DATE_SUFFIX_RE = /-\d{8}$/
const VERSION_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/
const SEP_RE = /[.\-]+/

export const ModelsDevModelSchema: z.ZodType<ModelsDevModel> = z.object({
  id: z.string(),
  name: z.string().optional(),
  limit: z.object({
    context: z.number().finite().optional(),
    output: z.number().finite().optional(),
  }).optional(),
  modalities: z.object({
    input: z.array(z.string()).optional(),
    output: z.array(z.string()).optional(),
  }).optional(),
  reasoning: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  temperature: z.boolean().optional(),
  structured_output: z.boolean().optional(),
  cost: z.object({
    input: z.number().finite().optional(),
    output: z.number().finite().optional(),
    cache_read: z.number().finite().optional(),
    cache_write: z.number().finite().optional(),
  }).optional(),
  family: z.string().optional(),
  knowledge: z.string().optional(),
  release_date: z.string().optional(),
}).passthrough()

const ModelsDevDataSchema = z.record(z.string(), z.object({
  models: z.record(z.string(), ModelsDevModelSchema),
}).passthrough())

const ModelsDevDataJsonSchema = z.string()
  .transform(raw => JSON.parse(raw))
  .pipe(ModelsDevDataSchema)

async function fetchFromNetwork(): Promise<ModelsDevData | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(MODELS_DEV_URL, { signal: controller.signal })
    if (!response.ok) {
      return null
    }
    return ModelsDevDataSchema.parse(await response.json())
  }
  finally {
    clearTimeout(timeout)
  }
}

/**
 * Read the DB snapshot. `expiresAt` is the hard-TTL deadline; fetch time is
 * derived as expiresAt - HARD_TTL so we don't need a schema change for SWR.
 * Hard-expired rows are still returned as stale fallbacks.
 */
function readDbCache(): { data: ModelsDevData, fetchedAt: number } | null {
  const row = db().select().from(kvCache).where(eq(kvCache.key, CACHE_KEY)).get()
  if (!row) {
    return null
  }
  try {
    return {
      data: ModelsDevDataJsonSchema.parse(row.value),
      fetchedAt: row.expiresAt * 1000 - HARD_TTL_MS,
    }
  }
  catch {
    return null
  }
}

function writeDbCache(data: ModelsDevData): void {
  try {
    const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(HARD_TTL_MS / 1000)
    db().insert(kvCache).values({ key: CACHE_KEY, value: JSON.stringify(data), expiresAt }).onConflictDoUpdate({ target: kvCache.key, set: { value: JSON.stringify(data), expiresAt } }).run()
  }
  catch {
    // non-critical, ignore
  }
}

function getLocalCache(): { data: ModelsDevData, fetchedAt: number } | null {
  if (memCache) {
    return { data: memCache, fetchedAt: memFetchedAt }
  }
  const fromDb = readDbCache()
  if (!fromDb) {
    return null
  }
  memCache = fromDb.data
  memFetchedAt = fromDb.fetchedAt
  return fromDb
}

function applyFresh(data: ModelsDevData): ModelsDevData {
  memCache = data
  memFetchedAt = Date.now()
  writeDbCache(data)
  return data
}

async function refreshFromNetwork(): Promise<ModelsDevData | null> {
  try {
    const fresh = await fetchFromNetwork()
    if (fresh) {
      return applyFresh(fresh)
    }
  }
  catch {
    // non-critical — caller falls back to stale
  }
  return null
}

function scheduleBackgroundRefresh(): void {
  if (refreshInFlight) {
    return
  }
  refreshInFlight = refreshFromNetwork().finally(() => {
    refreshInFlight = null
  })
}

/**
 * Load models.dev catalog with stale-while-revalidate:
 * - age < soft TTL → return cache
 * - soft ≤ age < hard → return cache, refresh in background
 * - age ≥ hard (or miss) → await network; fall back to stale on failure
 */
async function fetchModelsDevData(options?: { forceRefresh?: boolean }): Promise<ModelsDevData | null> {
  if (options?.forceRefresh) {
    return (await refreshFromNetwork()) ?? getLocalCache()?.data ?? null
  }

  const cached = getLocalCache()
  if (cached) {
    const age = Date.now() - cached.fetchedAt
    if (age < SOFT_TTL_MS) {
      return cached.data
    }
    if (age < HARD_TTL_MS) {
      scheduleBackgroundRefresh()
      return cached.data
    }
    return (await refreshFromNetwork()) ?? cached.data
  }

  return refreshFromNetwork()
}

/** Force-refresh models.dev on server startup (fire and forget; falls back to stale cache). */
export function warmupModelsDevCache(): void {
  void fetchModelsDevData({ forceRefresh: true })
}

/**
 * Synchronously look up a model's pricing.
 * Resolution order:
 *  1. Local model_registry_mappings table (user-configured overrides)
 *  2. In-memory models.dev cache (fuzzy matching)
 * Returns null if no cost data is found.
 */
export function getCachedModelsDevCost(modelId: string): { input: number, output: number } | null {
  // 1. Local mapping override (DB)
  try {
    const row = db().select().from(modelRegistryMappings).where(eq(modelRegistryMappings.modelId, modelId)).get()
    if (row?.modelJson) {
      const parsed = ModelsDevModelSchema.parse(JSON.parse(row.modelJson))
      const cost = parsed.cost
      if (cost && (cost.input != null || cost.output != null)) {
        return { input: cost.input ?? 0, output: cost.output ?? 0 }
      }
    }
  }
  catch {
    // non-critical, fall through
  }

  // 2. models.dev cache (fuzzy)
  if (!memCache) {
    return null
  }
  const result = findModelFuzzy(memCache, modelId)
  const cost = result?.model?.cost
  if (!cost || (cost.input == null && cost.output == null)) {
    return null
  }
  return {
    input: cost.input ?? 0,
    output: cost.output ?? 0,
  }
}

function findModel(data: ModelsDevData, modelId: string): ModelsDevModel | null {
  for (const provider of Object.values(data)) {
    const model = provider.models?.[modelId]
    if (model) {
      return model
    }
  }
  return null
}

function findModelWithProvider(data: ModelsDevData, modelId: string): { id: string, model: ModelsDevModel } | null {
  for (const provider of Object.values(data)) {
    const model = provider.models?.[modelId]
    if (model) {
      return { id: modelId, model }
    }
  }
  return null
}

/**
 * Token-aligned prefix check: split both IDs by `-` and `.` into tokens,
 * then require every candidate token to match the corresponding target token.
 * Rejects when the next unmatched target token is purely numeric (version mismatch).
 * e.g. "glm-5" does NOT match "glm-5-2-search" (next token "2" is numeric),
 * but "claude" DOES match "claude-sonnet-4" (next token "sonnet" is non-numeric).
 */
function tokensAlignedPrefix(candidate: string, target: string): boolean {
  const cTokens = candidate.toLowerCase().split(SEP_RE).filter(Boolean)
  const tTokens = target.toLowerCase().split(SEP_RE).filter(Boolean)

  if (cTokens.length === 0 || cTokens.length > tTokens.length) { return false }

  for (let i = 0; i < cTokens.length; i++) {
    if (cTokens[i] !== tTokens[i]) { return false }
  }

  // All candidate tokens matched — reject if next target token is a version number
  if (cTokens.length < tTokens.length && /^\d+$/.test(tTokens[cTokens.length])) {
    return false
  }

  return true
}

function findModelFuzzy(data: ModelsDevData, modelId: string): { model: ModelsDevModel, matchType: 'exact' | 'fuzzy' } | null {
  // 1. Try exact match first
  const exact = findModel(data, modelId)
  if (exact) {
    return { model: exact, matchType: 'exact' }
  }

  // 2. Try stripping date suffixes (e.g. "claude-sonnet-4-20250514" → "claude-sonnet-4")
  const withoutDate = modelId.replace(DATE_SUFFIX_RE, '')
  if (withoutDate !== modelId) {
    const match = findModel(data, withoutDate)
    if (match) {
      return { model: match, matchType: 'fuzzy' }
    }
  }

  // 3. Try stripping version suffixes (e.g. "gpt-4o-2024-11-20" → "gpt-4o")
  const withoutVersion = modelId.replace(VERSION_SUFFIX_RE, '')
  if (withoutVersion !== modelId && withoutVersion !== withoutDate) {
    const match = findModel(data, withoutVersion)
    if (match) {
      return { model: match, matchType: 'fuzzy' }
    }
  }

  // 3.5. Try normalizing dots ↔ hyphens (e.g. "claude-opus-4-7" ↔ "claude-opus-4.7")
  const dotsToHyphens = modelId.replace(/\./g, '-')
  if (dotsToHyphens !== modelId) {
    const match = findModel(data, dotsToHyphens)
    if (match) {
      return { model: match, matchType: 'fuzzy' }
    }
  }
  const hyphensToDots = modelId.replace(/-(?=\d)/g, '.')
  if (hyphensToDots !== modelId && hyphensToDots !== dotsToHyphens) {
    const match = findModel(data, hyphensToDots)
    if (match) {
      return { model: match, matchType: 'fuzzy' }
    }
  }

  // 4. Token-aligned prefix: registry model is a prefix of this modelId
  for (const provider of Object.values(data)) {
    for (const [id, model] of Object.entries(provider.models)) {
      if (tokensAlignedPrefix(id, modelId)) {
        return { model, matchType: 'fuzzy' }
      }
    }
  }

  // 5. Token-aligned prefix: this modelId is a prefix of a registry model
  for (const provider of Object.values(data)) {
    for (const [id, model] of Object.entries(provider.models)) {
      if (tokensAlignedPrefix(modelId, id)) {
        return { model, matchType: 'fuzzy' }
      }
    }
  }

  return null
}

function findModelFuzzyWithId(data: ModelsDevData, modelId: string): { id: string, model: ModelsDevModel, matchType: 'exact' | 'fuzzy' } | null {
  const exact = findModelWithProvider(data, modelId)
  if (exact) {
    return { ...exact, matchType: 'exact' }
  }

  const withoutDate = modelId.replace(DATE_SUFFIX_RE, '')
  if (withoutDate !== modelId) {
    const match = findModelWithProvider(data, withoutDate)
    if (match) {
      return { ...match, matchType: 'fuzzy' }
    }
  }

  const withoutVersion = modelId.replace(VERSION_SUFFIX_RE, '')
  if (withoutVersion !== modelId && withoutVersion !== withoutDate) {
    const match = findModelWithProvider(data, withoutVersion)
    if (match) {
      return { ...match, matchType: 'fuzzy' }
    }
  }

  // 3.5. Normalize dots ↔ hyphens
  const dotsToHyphens = modelId.replace(/\./g, '-')
  if (dotsToHyphens !== modelId) {
    const match = findModelWithProvider(data, dotsToHyphens)
    if (match) {
      return { ...match, matchType: 'fuzzy' }
    }
  }
  const hyphensToDots = modelId.replace(/-(?=\d)/g, '.')
  if (hyphensToDots !== modelId && hyphensToDots !== dotsToHyphens) {
    const match = findModelWithProvider(data, hyphensToDots)
    if (match) {
      return { ...match, matchType: 'fuzzy' }
    }
  }

  for (const provider of Object.values(data)) {
    for (const [id, model] of Object.entries(provider.models)) {
      if (tokensAlignedPrefix(id, modelId)) {
        return { id, model, matchType: 'fuzzy' }
      }
    }
  }

  for (const provider of Object.values(data)) {
    for (const [id, model] of Object.entries(provider.models)) {
      if (tokensAlignedPrefix(modelId, id)) {
        return { id, model, matchType: 'fuzzy' }
      }
    }
  }

  return null
}

function extractCapabilities(model: ModelsDevModel): ModelCapabilities {
  const caps: ModelCapabilities = {}
  if (model.limit?.context != null) {
    caps.contextWindow = model.limit.context
  }
  if (model.limit?.output != null) {
    caps.maxOutput = model.limit.output
  }
  if (model.modalities?.input) {
    caps.inputModalities = model.modalities.input
  }
  if (model.modalities?.output) {
    caps.outputModalities = model.modalities.output
  }
  if (model.reasoning != null) {
    caps.reasoning = model.reasoning
  }
  if (model.tool_call != null) {
    caps.toolCall = model.tool_call
  }
  if (model.temperature != null) {
    caps.temperature = model.temperature
  }
  if (model.structured_output != null) {
    caps.structuredOutput = model.structured_output
  }
  if (model.cost) {
    const cost: NonNullable<ModelCapabilities['cost']> = {}
    if (model.cost.input != null) {
      cost.input = model.cost.input
    }
    if (model.cost.output != null) {
      cost.output = model.cost.output
    }
    if (model.cost.cache_read != null) {
      cost.cacheRead = model.cost.cache_read
    }
    if (model.cost.cache_write != null) {
      cost.cacheWrite = model.cost.cache_write
    }
    if (Object.keys(cost).length > 0) {
      caps.cost = cost
    }
  }
  if (model.family) {
    caps.family = model.family
  }
  if (model.knowledge) {
    caps.knowledgeCutoff = model.knowledge
  }
  if (model.release_date) {
    caps.releaseDate = model.release_date
  }
  return caps
}

export async function enrichModelsFromRegistry(models: ModelDescriptor[]): Promise<ModelDescriptor[]> {
  const data = await fetchModelsDevData()
  return enrichModelsWithRegistryData(models, data, [])
}

export function enrichModelsWithRegistryData(
  models: ModelDescriptor[],
  data: ModelsDevData | null,
  mappings: ModelRegistryMappingEntry[],
): ModelDescriptor[] {
  const mappingsByModelId = new Map(mappings.map(mapping => [mapping.modelId, mapping]))

  return models.map((model) => {
    const mapping = mappingsByModelId.get(model.id)
    const mappedResult = mapping
      ? (() => {
          const mappedModel
            = mapping.model
              ?? (data && mapping.registryModelId
              ? findModelWithProvider(data, mapping.registryModelId)?.model
              : null)
          const mappedModelId = mapping.model?.id ?? mapping.registryModelId
          return mappedModel && mappedModelId
            ? { id: mappedModelId, model: mappedModel, matchType: mapping.matchType ?? 'manual' }
            : null
        })()
      : null
    const result = mappedResult ?? (data ? findModelFuzzyWithId(data, model.id) : null)

    if (!result) {
      return {
        ...model,
        capabilities: {
          ...model.capabilities,
          registryMatch: 'unmatched',
        },
      }
    }

    const registryCaps = extractCapabilities(result.model)
    const registryName = result.model.name
    const label = registryName ?? model.label
    return {
      ...model,
      label,
      capabilities: {
        ...registryCaps,
        ...model.capabilities,
        registryMatch: result.matchType,
        registryModelId: result.id,
        registryModelLabel: registryName ?? result.id,
      },
    }
  })
}

export async function enrichModelsFromRegistryMappings(
  models: ModelDescriptor[],
  mappings: ModelRegistryMappingEntry[],
): Promise<ModelDescriptor[]> {
  const data = await fetchModelsDevData()
  return enrichModelsWithRegistryData(models, data, mappings)
}

/**
 * Look up the context window for a single model ID.
 * Returns null if the model is not found in the registry.
 */
export async function lookupContextWindow(modelId: string): Promise<number | null> {
  const data = await fetchModelsDevData()
  if (!data) {
    return null
  }
  const info = findModel(data, modelId)
  return info?.limit?.context ?? null
}

/**
 * Look up a single model's metadata from models.dev registry.
 * Returns null if the model is not found.
 */
export async function lookupModel(modelId: string): Promise<ModelRegistrySearchResult | null> {
  const data = await fetchModelsDevData()
  if (!data) {
    return null
  }
  const info = findModel(data, modelId)
  if (!info) {
    return null
  }
  return {
    id: modelId,
    label: info.name ?? modelId,
    capabilities: extractCapabilities(info),
  }
}

/**
 * Look up a model with fuzzy matching (strips date/version suffixes, prefix matching).
 * Returns the raw ModelsDevModel data for direct use in runtime config bridging.
 */
export async function lookupModelRaw(modelId: string): Promise<ModelsDevModel | null> {
  const data = await fetchModelsDevData()
  if (!data) {
    return null
  }
  const result = findModelFuzzy(data, modelId)
  if (!result) {
    return null
  }
  return result.model
}

export async function lookupModelRawExact(modelId: string): Promise<ModelsDevModel | null> {
  const data = await fetchModelsDevData()
  if (!data) {
    return null
  }
  return findModel(data, modelId)
}

/**
 * Search models by substring match on ID or name.
 * Returns up to `limit` results.
 */
export async function searchModels(query: string, limit = 20): Promise<ModelRegistrySearchResult[]> {
  const data = await fetchModelsDevData()
  if (!data) {
    return []
  }

  const q = query.toLowerCase()
  const results: ModelRegistrySearchResult[] = []

  for (const provider of Object.values(data)) {
    for (const [id, model] of Object.entries(provider.models)) {
      const name = model.name ?? id
      if (id.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
        results.push({
          id,
          label: name,
          capabilities: extractCapabilities(model),
        })
        if (results.length >= limit) {
          return results
        }
      }
    }
  }

  return results
}
