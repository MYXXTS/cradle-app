# Usage Module

Provides two explicitly separate usage views. `GET /usage/local-summary` reads provider-native Codex and Claude archives to report machine-local lifetime totals without a Cradle usage table. Existing routes remain read-model analytics over `usage_logs` and represent Cradle-attributed activity, not the authoritative machine total.
Token and cost breakdowns use `sessions.agentId` for Agent attribution and `usage_logs.providerTargetId` for provider-target attribution.
Route metadata includes `x-cradle-cli` descriptors for generated CLI commands.

## Files

- **budget.ts**: Budget threshold helpers for usage cost checks.
- **index.ts**: Elysia routes under `/usage`, including CLI metadata for generated commands.
- **model.ts**: TypeBox request and response schemas for usage and cost endpoints.
- **pricing.ts**: Model pricing lookup and cost calculation helpers.
- **service.ts**: Drizzle queries, agent/provider attribution, cost aggregation, and streak calculations.
