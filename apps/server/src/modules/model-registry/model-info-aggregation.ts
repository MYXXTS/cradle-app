import type { ModelsDevModel, ModelsDevReasoningOption } from './model-info-registry'

export interface ModelsDevModelRecord {
  providerId: string
  model: ModelsDevModel
}

const MODALITY_ORDER = ['text', 'image', 'audio', 'video', 'pdf'] as const
const REASONING_EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const

function compareByPreferredOrder(values: readonly string[]): (left: string, right: string) => number {
  const rank = new Map(values.map((value, index) => [value, index]))
  return (left, right) => {
    const leftRank = rank.get(left)
    const rightRank = rank.get(right)
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER)
    }
    return left.localeCompare(right)
  }
}

function mergeStringSet(values: Array<string[] | undefined>, preferredOrder: readonly string[]): string[] | undefined {
  const declared = values.filter((value): value is string[] => value !== undefined)
  if (declared.length === 0) {
    return undefined
  }
  return [...new Set(declared.flat())].toSorted(compareByPreferredOrder(preferredOrder))
}

function mergeBoolean(values: Array<boolean | undefined>): boolean | undefined {
  if (values.includes(true)) {
    return true
  }
  if (values.includes(false)) {
    return false
  }
  return undefined
}

function selectMostCommonString(values: Array<string | undefined>): string | undefined {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (value !== undefined) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .toSorted(([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || leftValue.localeCompare(rightValue))[0]?.[0]
}

function selectMaximum(values: Array<number | undefined>): number | undefined {
  const declared = values.filter((value): value is number => value !== undefined)
  return declared.length > 0 ? Math.max(...declared) : undefined
}

function mergeReasoningOptions(
  values: Array<ModelsDevReasoningOption[] | undefined>,
): ModelsDevReasoningOption[] | undefined {
  const declared = values.filter((value): value is ModelsDevReasoningOption[] => value !== undefined)
  if (declared.length === 0) {
    return undefined
  }

  const options = declared.flat()
  const effortValues = options
    .filter(option => option.type === 'effort')
    .flatMap(option => option.values ?? [])
    .filter((value): value is string => value !== null)
  const merged: ModelsDevReasoningOption[] = []
  if (effortValues.length > 0) {
    merged.push({
      type: 'effort',
      values: [...new Set(effortValues)].toSorted(compareByPreferredOrder(REASONING_EFFORT_ORDER)),
    })
  }

  const seen = new Set<string>()
  for (const option of options
    .filter(option => option.type !== 'effort')
    .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))) {
    const key = JSON.stringify(option)
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(option)
    }
  }
  return merged
}

function selectMostCompleteCost(records: ModelsDevModelRecord[]): ModelsDevModel['cost'] {
  const candidates = records
    .filter((record): record is ModelsDevModelRecord & { model: ModelsDevModel & { cost: NonNullable<ModelsDevModel['cost']> } } =>
      record.model.cost !== undefined)
    .toSorted((left, right) => {
      const leftCompleteness = Object.values(left.model.cost).filter(value => value !== undefined).length
      const rightCompleteness = Object.values(right.model.cost).filter(value => value !== undefined).length
      return rightCompleteness - leftCompleteness || left.providerId.localeCompare(right.providerId)
    })
  const cost = candidates[0]?.model.cost
  return cost ? { ...cost } : undefined
}

/**
 * Builds an optimistic, provider-agnostic projection for an otherwise unknown
 * gateway. Any explicitly supported capability wins, while provider-specific
 * scalar conflicts are resolved deterministically.
 */
export function aggregateModelsDevRecords(modelId: string, records: ModelsDevModelRecord[]): ModelsDevModel | null {
  if (records.length === 0) {
    return null
  }

  const models = records.map(record => record.model)
  const context = selectMaximum(models.map(model => model.limit?.context))
  const output = selectMaximum(models.map(model => model.limit?.output))
  const inputModalities = mergeStringSet(models.map(model => model.modalities?.input), MODALITY_ORDER)
  const outputModalities = mergeStringSet(models.map(model => model.modalities?.output), MODALITY_ORDER)
  const name = selectMostCommonString(models.map(model => model.name))
  const reasoningOptions = mergeReasoningOptions(models.map(model => model.reasoning_options))
  const reasoning = reasoningOptions && reasoningOptions.length > 0
    ? true
    : mergeBoolean(models.map(model => model.reasoning))
  const toolCall = mergeBoolean(models.map(model => model.tool_call))
  const temperature = mergeBoolean(models.map(model => model.temperature))
  const structuredOutput = mergeBoolean(models.map(model => model.structured_output))
  const cost = selectMostCompleteCost(records)
  const family = selectMostCommonString(models.map(model => model.family))
  const knowledge = selectMostCommonString(models.map(model => model.knowledge))
  const releaseDate = selectMostCommonString(models.map(model => model.release_date))

  return {
    id: modelId,
    ...(name ? { name } : {}),
    ...(context !== undefined || output !== undefined
      ? { limit: { ...(context !== undefined ? { context } : {}), ...(output !== undefined ? { output } : {}) } }
      : {}),
    ...(inputModalities !== undefined || outputModalities !== undefined
      ? {
          modalities: {
            ...(inputModalities !== undefined ? { input: inputModalities } : {}),
            ...(outputModalities !== undefined ? { output: outputModalities } : {}),
          },
        }
      : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(reasoningOptions !== undefined ? { reasoning_options: reasoningOptions } : {}),
    ...(toolCall !== undefined ? { tool_call: toolCall } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(structuredOutput !== undefined ? { structured_output: structuredOutput } : {}),
    ...(cost ? { cost } : {}),
    ...(family ? { family } : {}),
    ...(knowledge ? { knowledge } : {}),
    ...(releaseDate ? { release_date: releaseDate } : {}),
  }
}
