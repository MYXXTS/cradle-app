# model-registry

全局模型 registry 映射模块，负责维护 Cradle-owned model ID 到 registry model 的映射。

这个模块拥有所有 target 共享的单一 enrichment resolve path（见 Plan 035 M1）。Provider target 可以声明 custom model ID，但不拥有 capabilities；custom model 与上游模型列表都会通过 `resolveModelEnrichment` 和只读 models.dev 数据完成能力补全。

## Four-layer contract (Plan 035)

This module owns **Enrichment** (layer 2):
- `resolveModelEnrichment(modelId, data, mappings)` is the single resolver used by list projection,
  lookup, pricing, context-window, and all future consumers.
- Resolution order: global mapping (model or registryModelId exact→fuzzy) → models.dev fuzzy.
- Registry caps **win over** stale inventory caps on merge.

## Files

- `index.ts`: HTTP routes for listing, upserting, and deleting global model registry mappings.
- `model.ts`: TypeBox schemas for mapping route params, payloads, and responses.
- `service.ts`: Drizzle-backed global mapping persistence. `upsertMapping` uses fuzzy lookup
  (`lookupModelRaw`) so alias rows store usable JSON when possible.
- `model-info-registry.ts`: Read-only models.dev cache (SWR: 1h soft / 24h hard TTL, force-refresh
  on server boot), `resolveModelEnrichment`, `enrichModelsWithRegistryData`,
  `enrichModelsFromRegistryMappings`, `getCachedModelsDevCost` (DB-backed, not mem-only),
  fuzzy-enabled `lookupContextWindow` and `lookupModel`.
  - Projects `reasoning` + `reasoning_options` into `capabilities.reasoning` /
    `reasoningEfforts` (`effort.values` only; empty/toggle/budget-only → `[]`).
  - Upstream inventory `reasoningEfforts` win over registry projection on merge.
