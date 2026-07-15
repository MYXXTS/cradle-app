# Plan 055：将 Cradle Codex Usage 改为逐模型调用的权威账本

> **执行者说明**：严格按步骤执行，每一步都运行对应验证命令并确认预期结果。
> 命中「停止条件」时必须停止并报告，不得自行猜测、使用时间邻近关系补归属，或扩展到
> Cradle 外部的 Provider archives。完成后更新 `plans/README.md` 中本计划的状态；若 reviewer
> 明确表示由其维护索引，则不要修改状态。
>
> **漂移检查（首先运行）**：
>
> ```bash
> git diff --stat 6386df4..HEAD -- \
>   packages/db/src/schema/chat.ts \
>   packages/db/drizzle \
>   packages/chat-runtime-contracts/src/index.ts \
>   apps/server/src/modules/chat-runtime-providers/codex \
>   apps/server/src/modules/chat-runtime/run \
>   apps/server/src/modules/usage \
>   apps/server/src/modules/session/service.ts \
>   apps/server/tests/turn-executor.test.ts \
>   apps/server/tests/usage.test.ts \
>   apps/server/tests/profiles.test.ts \
>   apps/server/tests/elysia-skeleton.test.ts \
>   apps/web/src/api-gen
> ```
>
> 本计划编写时 operator 正在移除 Plan 053 的错误产品方向，并且 chat-runtime host/stream
> 相关文件存在并行修改。上述输出非空是预期情况；执行者必须逐项对照「执行前置条件」与
> 「当前状态」中的符号和语义。若 Plan 053 清理尚未完成，或任一 load-bearing seam 已与摘录
> 语义不一致，必须停止并报告，不得覆盖并行工作。

## 状态

- **状态**：DONE
- **优先级**：P0
- **工作量**：L
- **风险**：MED
- **依赖**：operator 完成 Plan 053 错误实现的移除
- **类别**：bug、migration、tests、docs
- **计划基线**：commit `6386df4`，2026-07-15
- **取代计划**：`plans/025-usage-authoritative-fields.md` 与已移除的 Plan 053 方向

## 为什么需要做

当前 Codex provider 在一个 Cradle run 结束时只把最近一次模型请求的 `lastUsage` 写入
`usage_logs`。一个 Codex turn 可以执行多次模型调用，并可以创建拥有独立 thread/turn 的
subagents，因此 run-final 单行会漏算中间调用和 descendants。另一方面，把 native
`tokenUsage.total` 逐 run 写入也会重复计算之前 turns，因为它是 thread lifetime cumulative。

完成后，`usage_logs` 不再表示模糊的 run-final summary，而是 Cradle-owned runtimes 的逐模型调用
事实表。每一条 Codex row 都必须确定归属于一个 Cradle session、Codex thread、Codex turn 和实际
model；现有 session、model、date、cost 与 agent 查询继续聚合同一张表，不再维护 machine-local
summary 或第二套 Token 总量。

## 执行前置条件

operator 正在独立移除 Plan 053 的错误实现。开始本计划前必须确认：

```bash
test ! -e apps/server/src/modules/usage/local
test ! -e apps/server/src/modules/chat-runtime-providers/claude-agent/local-usage-source.ts
test ! -e apps/server/src/modules/chat-runtime-providers/claude-agent/usage-archive.ts
test ! -e apps/web/src/features/usage/usage-local-summary.tsx
rg -n "local-summary|UsageLocalSummary|configureLocalUsageSources" apps packages
```

预期：四个 `test` 均 exit 0，`rg` 无输出。若任一旧入口仍存在，停止并让 operator 先完成清理。
本计划允许在 Codex namespace 内重新建立一个只读取 Cradle-owned runtime home 的 recovery
adapter，但不得恢复全局 Home discovery、Claude transcript reader 或 machine-local UI/API。

## 不可漂移的产品语义

### 权威范围

- 只统计由 Cradle 启动、绑定和运行的 Codex sessions。
- 不读取用户全局 `~/.codex`，不统计 Cradle 外部 Codex CLI、Claude transcripts 或其他本机工具。
- 不新增 single-writer lease、锁、排队、并发拒绝或相关测试；该问题不属于 Cradle-owned runtime 范围。
- `usage_logs` 是唯一 Token 事实表；不得新增平行 `provider_usage_events` 表。

### Codex 模型调用事实

- 一条 `thread/tokenUsage/updated` 对应一个可幂等记录的 native usage checkpoint。
- 入账增量使用 `tokenUsage.last`，不得把 `tokenUsage.total` 当作当前 run 或当前调用的增量。
- `tokenUsage.total` 只用于稳定 identity、replay dedupe 与 recovery reconciliation。
- 每条正式 Codex row 必须拥有非空 `sessionId`、`providerSessionId`、`providerThreadId`、
  `providerTurnId` 与 `modelId`。
- Root 与任意深度 subagent 调用分别入账；subagent 通过 Codex native ancestry 归到同一个
  Cradle session，但保留自己的 thread/turn identity。
- `cachedInputTokens` 是 input 子集，`reasoningOutputTokens` 是 output 子集；两者不得再次加入
  `totalTokens`。
- `createdAt` 表示 Provider usage event 的发生时间，不是延迟 backfill 的插入时间。

### 查询语义

- Session total：`GROUP BY usage_logs.session_id`。
- Model total：`GROUP BY usage_logs.model_id`。
- Session × model：同时按 `session_id, model_id` 分组。
- Daily/hourly：按 event `created_at` 分组。
- `totalTurns` 与所有语义为 turn count 的 `count` 使用 distinct logical turn key；逐调用入账后
  禁止继续使用 `COUNT(*)` 冒充 turns。
- Cost 继续按每行的确定 model 与 Token breakdown 计算；Codex 不允许进入 `unknown` model bucket。

### 历史与恢复

- 旧 Codex `usage_logs` rows 是错误的 run-final summaries，迁移时必须删除，不能和新 rows 相加。
- 只允许从 Cradle Codex runtime home backfill；每个 event 必须从 rollout 的 `session_meta`、
  `turn_context` 与 `token_count` 确定 thread、turn、model、timestamp 与 usage。
- Backfill 与实时路径必须生成相同 row id，重复执行结果不变。
- 解析中一旦缺少 turn/model 或发现同一文件无法确定当前 turn，必须记录 ingestion incident 并跳过，
  禁止使用最近时间、CWD、model 猜测或写入 `unknown`。

## 当前状态

### `usage_logs` 仍是 run-summary shape

`packages/db/src/schema/chat.ts:94-112` 当前只有 Cradle session/message/provider/model 与三项 Token：

```ts
export const usageLogs = sqliteTable('usage_logs', {
  id: textPk(),
  sessionId: text('session_id').notNull(),
  messageId: text('message_id'),
  providerTargetId: text('provider_target_id'),
  modelId: text('model_id'),
  promptTokens: int('prompt_tokens').notNull().default(0),
  completionTokens: int('completion_tokens').notNull().default(0),
  totalTokens: int('total_tokens').notNull().default(0),
  ...createdAt(),
})
```

它缺少 run、Provider session/thread/turn、cached/reasoning breakdown 与 native cumulative
checkpoint，无法精确去重、恢复或审计 Codex 多调用 turns。

### Codex notification 已提供 thread、turn、last 与 total

生成协议 `app-server-protocol/v2/ThreadTokenUsageUpdatedNotification.ts` 定义：

```ts
export type ThreadTokenUsageUpdatedNotification = {
  threadId: string
  turnId: string
  tokenUsage: ThreadTokenUsage
}
```

`ThreadTokenUsage` 同时包含 `total` 与 `last`。`model/rerouted` 还提供
`threadId`、`turnId`、`fromModel` 与 `toModel`，足够让 Codex adapter 按 turn 维护 effective model。

### Provider 当前只覆盖一个 `_lastUsage`

`apps/server/src/modules/chat-runtime-providers/codex/provider.ts` 当前在每条 usage notification 上覆盖
同一个实例字段：

```ts
private captureLastTokenUsage(notification: CodexAppServerMessage): void {
  if (notification.method !== 'thread/tokenUsage/updated') {
    return
  }
  const params = notification.params as ThreadTokenUsageUpdatedNotificationParams | undefined
  const usage = readCodexLastTokenUsage(params?.tokenUsage)
  if (usage) {
    this._lastUsage = usage
  }
}
```

该路径既丢失之前模型调用，也无法分别记录 root 与 subagent。

### Turn finalization 只写一次 usage

`apps/server/src/modules/chat-runtime/run/turn-executor.ts` 当前执行：

```ts
const usage = activeRun.runtime?.totalUsage ?? activeRun.runtime?.lastUsage
actualModelId = activeRun.runtime?.lastModelId ?? activeRun.modelId
if (usage) {
  insertRunUsage({
    sessionId: activeRun.sessionId,
    messageId: activeRun.messageId,
    providerTargetId: activeRun.providerTargetId,
    modelId: actualModelId,
    usage,
  })
}
```

`apps/server/src/modules/chat-runtime/run/usage.ts` 使用随机 UUID insert，因此 native notification
重放也无法幂等。

### Runtime seam 已有 active-run metadata

`StreamTurnInput` 已传递 `runId`、`runtimeSession`、`responseMessageId` 与 `modelId`，TurnExecutor 还拥有
`sessionId` 与 `providerTargetId`。正确 seam 是 Provider 输出 typed usage event，由 TurnExecutor 附加
Cradle-owned metadata，再调用 Usage owner 持久化；Codex provider 不应直接 import DB 或 Usage module。

### Usage queries 把 row count 当作 turn count

`apps/server/src/modules/usage/service.ts` 的 daily、summary、agent、provider、model 与 session 查询广泛
使用 `COUNT(*)`。逐模型调用写入后，这会变成 call count；`getUsageSummary()` 却把它返回为
`totalTurns`，必须同步修正为 distinct logical turn。

### 现有绑定可确定 Cradle ownership

`backend_session_bindings` 已保存 `chatSessionId`、`runtimeKind`、`backendSessionId` 与
`requestedModelId`。`backend_runs` 已保存 Cradle `runId`、session、message 与生命周期。Recovery
adapter 必须从这些 owner records 出发，只枚举 `runtimeKind = 'codex'` 的 Cradle bindings，不能扫描
所有本机 Provider homes。

## 目标架构

```text
Codex native notifications
  thread/started + turn/started + model/rerouted + tokenUsage/updated
        │
        ▼
CodexUsageEventProjector
  - tracks effective model per thread/turn
  - projects last usage as one typed event
  - derives stable id from thread + turn + cumulative fingerprint
        │
        ▼
StreamTurnInput.onUsageEvent
        │
        ▼
TurnExecutor
  - attaches Cradle session/run/message/provider target/root provider session
        │
        ▼
Usage.recordRuntimeUsageEvent
  - validates required Codex dimensions
  - INSERT ... ON CONFLICT DO NOTHING
        │
        ▼
usage_logs
        │
        ├── session totals
        ├── model totals
        ├── session × model
        ├── daily/hourly
        └── cost/agent/provider projections

Cradle Codex rollout reconciliation
  - only bound Cradle runtime homes
  - same event id as live path
  - inserts only missing events
```

## 目标 Interface

在 shared runtime contract 增加一个小型 typed event；不得暴露 Codex notification 或 DB row：

```ts
export interface RuntimeUsageEvent {
  id: string
  providerThreadId: string
  providerTurnId: string
  modelId: string
  occurredAt: number
  usage: TokenUsage
  providerTotal: TokenUsage
}

export interface StreamTurnInput {
  onUsageEvent?: (event: RuntimeUsageEvent) => void | Promise<void>
}
```

Usage owner 提供单一写入口：

```ts
export function recordRuntimeUsageEvent(input: {
  event: RuntimeUsageEvent
  sessionId: string
  runId: string | null
  messageId: string | null
  providerTargetId: string | null
  providerSessionId: string
}): 'inserted' | 'duplicate'
```

Provider adapter 只负责 native → runtime event；TurnExecutor 只附加 active-run metadata；Usage module
独占验证、Drizzle 写入与 row semantics。不要把 archive parser、Codex notification guards 或 SQL
散落到调用链。

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate migration | `pnpm --filter @cradle/db generate` | exit 0；新增一个 migration、snapshot 与 journal entry |
| Codex focused tests | `pnpm --filter @cradle/server exec vitest run src/modules/chat-runtime-providers/codex/usage-event-projector.test.ts src/modules/chat-runtime-providers/codex/provider.test.ts` | all tests pass |
| Turn accounting tests | `pnpm --filter @cradle/server exec vitest run tests/turn-executor.test.ts` | all tests pass |
| Usage tests | `pnpm --filter @cradle/server exec vitest run tests/usage.test.ts tests/profiles.test.ts tests/elysia-skeleton.test.ts` | all tests pass |
| Server typecheck | `pnpm typecheck:server` | exit 0；module boundary check 不新增 SCC |
| Generate Web client | `pnpm generate:web` | exit 0；generated API 与 server schema 一致 |
| Web typecheck | `pnpm typecheck:apps-web` | exit 0 |
| Server suite | `pnpm test:server` | all tests pass |
| Lint | `pnpm lint` | exit 0 |
| Diff integrity | `git diff --check` | no output |

## Suggested executor toolkit

- 使用 `server-app-development` 校验 Usage owner、Elysia/TypeBox、README 与 module boundary。
- 使用 `cradle-chat-runtime-sdk-update` 校验 Codex generated notification semantics；不得手改 generated
  protocol files。
- 使用 `codebase-design` 保持 Provider adapter、TurnExecutor enrichment 与 Usage persistence 三个 seam
  的 interface 小而明确。

## Scope

**In scope**：

- `packages/db/src/schema/chat.ts`
- `packages/db/drizzle/<next-migration>.sql` 与对应 generated metadata
- `packages/chat-runtime-contracts/src/index.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/usage-event-projector.ts`（新增）
- `apps/server/src/modules/chat-runtime-providers/codex/usage-event-projector.test.ts`（新增）
- `apps/server/src/modules/chat-runtime-providers/codex/usage-reconciliation.ts`（新增）
- `apps/server/src/modules/chat-runtime-providers/codex/usage-reconciliation.test.ts`（新增）
- `apps/server/src/modules/chat-runtime-providers/codex/provider.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/provider.test.ts`
- `apps/server/src/modules/chat-runtime/run/turn-executor.ts`
- `apps/server/src/modules/chat-runtime/run/usage.ts`
- `apps/server/src/modules/chat-runtime/run-registry.ts`（仅当需要保存本 run 已记录 usage aggregate）
- `apps/server/src/modules/usage/ingest.ts`（新增）
- `apps/server/src/modules/usage/ingest.test.ts`（新增）
- `apps/server/src/modules/usage/service.ts`
- `apps/server/src/modules/usage/model.ts`
- `apps/server/src/modules/usage/README.md`
- `apps/server/src/modules/chat-runtime/README.md`
- `apps/server/tests/turn-executor.test.ts`
- `apps/server/tests/usage.test.ts`
- 因 `usage_logs` columns 变化而必须更新的现有 fixture：
  `apps/server/tests/profiles.test.ts`、`apps/server/tests/elysia-skeleton.test.ts`
- `apps/web/src/api-gen/**`（只允许 generator 输出）

**Out of scope**：

- 用户全局 `~/.codex`、`CODEX_HOME` discovery 与任何 Cradle 外部 session。
- Claude Agent、本机 transcripts、OpenCode、Gemini、Cursor 或通用 Provider archive adapter。
- `/usage/local-summary`、`UsageLocalSummary` 与 machine-local dashboard；这些由 operator 先行移除。
- Single-writer locks、leases、owner arbitration、queue 或并发拒绝。
- Prompt、response、archive path 或 transcript content 持久化。
- 新增平行 usage event table；必须深化现有 `usage_logs`。
- 为节省空间增加 TTL、rollup、自动删除、VACUUM scheduler 或 retention policy。
- 修改 generated Codex protocol files。
- 将无法确定 model/turn 的事件写入 `unknown`。

## Git workflow

- 建议 branch：`advisor/055-authoritative-cradle-codex-usage-events`
- 建议 commits：

```text
test(codex): characterize per-call usage events
refactor(db): deepen usage logs into provider call facts
feat(codex): persist authoritative per-call usage
fix(usage): preserve turn and model aggregation semantics
```

- 不 push、不创建 PR，除非 operator 明确要求。
- 当前工作树存在大量用户并行修改；不得清理、reset、checkout 或覆盖任何范围外 diff。

## Steps

### Step 1：先固化 Codex usage event 语义

新增 `usage-event-projector.test.ts`，使用 generated protocol shape 构造脱敏 fixtures，至少证明：

1. 同一 root turn 连续三次 `tokenUsage/updated` 产生三条 event，usage 分别来自每次 `last`。
2. 相同 `threadId + turnId + total breakdown` 重放只生成相同 event id。
3. `cachedInputTokens` 与 `reasoningOutputTokens` 被保留，但不加入 `totalTokens` 第二次。
4. `model/rerouted` 后的下一条 usage event 使用 `toModel`。
5. Direct child 与 nested subagent 的 usage 保留 child thread/turn，同时由上层绑定到 root Cradle session。
6. 缺少 `threadId`、`turnId`、effective model 或非正 usage 时返回明确错误/incident result，不输出可持久化 event。
7. Subagent 初始 model 继承 root effective model；若真实 Codex trace 证明 child 可以在没有
   `model/rerouted` 的情况下使用不同 model，停止并报告协议缺口。

另外增加一个结构化真实 fixture：将原始 identities 替换为固定 placeholder，只保留 notification method、
model 与数值 usage，不得包含 prompt/response/path，确认真实 app-server 的 notification 顺序与测试假设一致。

**Verify**：

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/codex/usage-event-projector.test.ts
```

预期：所有 characterization tests 通过；若无法写出不依赖 heuristic 的 model/turn fixture，命中停止条件。

### Step 2：将 `usage_logs` 深化为 Provider call fact

修改 `packages/db/src/schema/chat.ts`。保留 `id` 作为主键，并让 Codex event 使用 deterministic id；不要
再增加重复的 `eventKey` unique column。增加：

```ts
runId: text('run_id')
providerSessionId: text('provider_session_id')
providerThreadId: text('provider_thread_id')
providerTurnId: text('provider_turn_id')
cachedInputTokens: int('cached_input_tokens').notNull().default(0)
reasoningOutputTokens: int('reasoning_output_tokens').notNull().default(0)
providerTotalPromptTokens: int('provider_total_prompt_tokens')
providerTotalCachedInputTokens: int('provider_total_cached_input_tokens')
providerTotalCompletionTokens: int('provider_total_completion_tokens')
providerTotalReasoningOutputTokens: int('provider_total_reasoning_output_tokens')
providerTotalTokens: int('provider_total_tokens')
```

`runId` 允许 recovery/backfill 为 null；实时 Codex events 必须非空。Provider identity columns 为 nullable
是为了不强迫本计划同时迁移其他 runtimes，但 `recordRuntimeUsageEvent` 对 Codex 执行 required validation。
`modelId` 保持 DB-level nullable，Codex ingestion 必须拒绝 null。

增加实际查询需要的索引：

```text
usage_logs_run_id_idx
usage_logs_session_model_created_at_idx
usage_logs_provider_thread_created_at_idx
```

生成下一 migration，并在 migration SQL 中删除旧 Codex run-summary rows：

```sql
DELETE FROM usage_logs
WHERE session_id IN (
  SELECT id FROM sessions WHERE runtime_kind = 'codex'
);
```

这是有意的 breaking data correction。不得保留旧 Codex rows 并在查询时增加复杂 source filter。

**Verify**：

```bash
pnpm --filter @cradle/db generate
rg -n "provider_thread_id|provider_turn_id|cached_input_tokens" packages/db/drizzle
rg -n "DELETE FROM usage_logs" packages/db/drizzle/<next-migration>.sql
```

预期：migration、snapshot、journal 只包含上述 schema/data correction；两个 `rg` 均命中目标内容。

### Step 3：建立 typed runtime usage event seam

在 `packages/chat-runtime-contracts/src/index.ts` 增加 `RuntimeUsageEvent` 与
`StreamTurnInput.onUsageEvent`。Callback 必须允许 Promise，使 TurnExecutor 的 durable insert 能在 Provider
继续消费下一 notification 前完成；不得使用 fire-and-forget。

在 `usage-event-projector.ts` 集中实现：

- per-thread/turn effective model tracking；
- `model/rerouted` state transition；
- native breakdown → `TokenUsage`；
- deterministic SHA-256 id，输入仅包含 runtime kind、thread、turn 与完整 cumulative breakdown；
- notification timestamp 缺失时使用 receive time，并把该行为限制在 live path；
- required identity/model validation。

Provider 只调用 projector，并 `await turnInput.onUsageEvent?.(event)`。不要在 Provider 内 import Drizzle、
`db()` 或 Usage module。Callback 必须在 root-thread filtering 之前观察 notifications，确保 descendants
也入账。

**Verify**：

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/codex/usage-event-projector.test.ts \
  src/modules/chat-runtime-providers/codex/provider.test.ts
pnpm typecheck:server
```

预期：focused tests 与 typecheck 通过，module boundary SCC 不增加。

### Step 4：让 Usage owner 幂等持久化事件

新增 `apps/server/src/modules/usage/ingest.ts`，实现 `recordRuntimeUsageEvent`：

- 校验 session/provider session/thread/turn/model 均非空；
- 将 `usage.promptTokens`、`completionTokens` 与 breakdown 写入 row；
- 将 `providerTotal` 写入 cumulative checkpoint columns；
- `createdAt` 使用 event `occurredAt`；
- 使用 deterministic event id 与 `onConflictDoNothing()`；
- 返回 `inserted | duplicate`，不得通过先 SELECT 再 INSERT 制造 race window；
- 不保存 raw notification 或 transcript。

TurnExecutor 提供 callback，附加 `activeRun.sessionId`、`runId`、`messageId`、`providerTargetId` 与
`runtimeSession.providerSessionId`。若 Codex provider session 尚为空或 event 缺少 required dimensions，记录
Observability ingestion incident 并让当前 run 失败；不得静默跳过并在 finalization 写一个 fallback row。

Active run 可以累计已成功持久化的 events 以供 generation observation/final snapshot 使用，但不得再次 insert
aggregate。若需要修改 `run-registry.ts`，只添加本 run usage aggregate 与 event count，不扩展其他 lifecycle。

**Verify**：

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/usage/ingest.test.ts \
  tests/turn-executor.test.ts
```

预期：三次 Codex call 写三行；相同 event 重放仍是三行；session/run/message/model/provider identities 全部正确。

### Step 5：删除 Codex run-final fallback，保留其他 runtime 行为

将 Codex 从 `_lastUsage` + run-final `insertRunUsage()` 路径迁出。推荐在 `ChatRuntime` 声明显式
`usageAccounting: 'run-summary' | 'provider-events'`，Codex 为 `provider-events`，现有其他 runtimes 默认
`run-summary`。不要通过 `runtimeKind === 'codex'` 分支把 Provider 名称散落在 TurnExecutor。

Finalization 规则：

- `provider-events`：只使用本 run 已记录 events 的 aggregate 生成 observation/snapshot，不 insert summary。
- `run-summary`：保持当前 `totalUsage ?? lastUsage` insert 行为。
- `provider-events` 在模型输出完成但 event count 为 0 时产生 ingestion incident；禁止降级为 `_lastUsage`。
- `step_usage` 保持原有语义，不与 `usage_logs` 相加。

删除 Codex `_lastUsage` 捕获或确保它不再参与持久化；同时更新相关 provider/turn-executor tests。

**Verify**：

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/codex/provider.test.ts \
  tests/turn-executor.test.ts
```

预期：Codex 多调用无额外 run-summary row；Standard/Claude/OpenCode 现有 run-summary tests 不回归。

### Step 6：实现 Cradle-owned rollout reconciliation 与 backfill

新增 `usage-reconciliation.ts`，只从 `backend_session_bindings.runtimeKind = 'codex'` 出发：

1. 读取 binding 的 `backendSessionId` 作为 root Provider identity。
2. 使用 Codex native ancestry 列出 root 与 descendants。
3. 只读取 Cradle Codex runtime home 内、由 native thread metadata 返回的 rollout path；canonical path 必须
   位于该 runtime home，越界立即拒绝。
4. 用 `session_meta` 建立 thread identity，用 `turn_context.turn_id + model` 建立当前 turn/model，用每条
   `token_count.info.last_token_usage` 形成 event，用 `total_token_usage` 形成与 live 相同的 fingerprint。
5. 使用 archive timestamp 作为 `occurredAt`。
6. 调用同一个 `recordRuntimeUsageEvent`，使 backfill/restart/retry 幂等。
7. 找不到精确 Cradle run/message 时允许 `runId/messageId = null`，但 session/thread/turn/model 必须完整。

触发点仅包括：server 启动后的 bounded backfill、Codex turn terminal reconciliation，以及显式测试入口。
不要增加全局 watcher、轮询或新 cursor table；最新 `usage_logs` cumulative checkpoint 本身就是去重/恢复基线。

测试覆盖：live 后 reconciliation 无新增、漏一条 live event 后补一条、malformed tail、model reroute、direct/nested
subagent、越界 path、缺失 turn/model、重复 backfill、旧 Codex row 清理后重建。

**Verify**：

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/codex/usage-reconciliation.test.ts \
  src/modules/usage/ingest.test.ts
```

预期：全部 recovery tests 通过；任何 ambiguous fixture 只产生 incident，不写 `unknown` row。

### Step 7：修正 Usage 查询的 turn 与 model 语义

审查 `apps/server/src/modules/usage/service.ts` 中每个 `COUNT(*)`：

- 表示 Token event/call count 的字段可以继续 row count，但必须命名和文档明确。
- 表示 turn 的 `totalTurns`、daily/hourly/session/recent-session `turnCount` 使用：

```sql
COUNT(DISTINCT COALESCE(run_id, provider_turn_id, id))
```

- 分 model 查询使用确定的 `model_id`；Codex rows 不得出现 null/`unknown`。
- `getSessionUsage(sessionId)` 增加 `byModel`，每项包含 model、Token breakdown 与 distinct turn count。
- Session total、`byModel` 总量、daily 总量与 overall total 必须满足同一 scope 下的恒等关系。
- Cost query 继续逐 row 汇总 Token，但其 `count` 语义必须明确为 model calls 或改为 distinct turns；选择后统一
  route schema、README 与 tests，不允许同名字段在不同 endpoint 含义不同。

更新 `UsageModel.sessionUsage`，运行 Web API generator；不得手改 generated files。

**Verify**：

```bash
pnpm --filter @cradle/server exec vitest run \
  tests/usage.test.ts \
  tests/profiles.test.ts \
  tests/elysia-skeleton.test.ts
pnpm generate:web
pnpm typecheck:apps-web
```

预期：同一 run 三个 model calls 的 Token 全部计入，但 `totalTurns = 1`；session × model fixtures 与 API schema
一致；Web generated client 编译通过。

### Step 8：更新 ownership 文档并完成全量验证

更新 Usage README：`usage_logs` 是 Provider call fact owner；Codex 是 provider-events accounting，其他 runtime
仍为 run-summary accounting，直到各自迁移。更新 Chat Runtime README：Provider 输出 typed usage event，
TurnExecutor enrich，Usage owner persist。明确 Plan 053 machine-local/archive-summary 产品已被取代。

运行：

```bash
pnpm typecheck:server
pnpm typecheck:apps-web
pnpm test:server
pnpm lint
git diff --check
git status --short
```

预期：所有命令 exit 0；`git diff --check` 无输出；无范围外文件被 executor 修改；operator 的既有并行 diff
保持原样。

## 测试计划

- **Projector**：多调用、duplicate replay、cached/reasoning subset、reroute、root/direct/nested child、缺失 identity/model。
- **Ingest**：required Codex dimensions、deterministic PK、`ON CONFLICT DO NOTHING`、event occurrence time、完整 breakdown。
- **TurnExecutor**：provider-events 与 run-summary 两种 accounting mode、Codex 不写 final fallback、observation aggregate。
- **Recovery**：Cradle-only root discovery、live/archive identity parity、漏 event 补写、malformed tail、reroute、nested
  descendants、path containment、ambiguous rejection。
- **Queries**：session、model、session × model、daily/hourly、agent/provider/cost；逐调用 rows 不放大 logical turn count。
- **Migration**：旧 Codex rows 被删除；非 Codex rows 保留；新 columns/defaults/indexes 正确。
- 不增加 browser E2E；Server integration 与 focused provider tests 足以覆盖关键路径。

## 完成标准

- [x] Cradle Codex 每条模型调用写入一条且仅一条 `usage_logs` row。
- [x] 每条 Codex row 都有确定的 Cradle session、Provider session/thread/turn 与 model。
- [x] Root 与任意深度 subagent usage 都归到正确 Cradle session。
- [x] `tokenUsage.last` 是入账 delta；`total` 只作 identity/checkpoint。
- [x] Duplicate notification、restart reconciliation 与重复 backfill 均不增加重复 rows。
- [x] Cached input 与 reasoning output 保留 breakdown，但不重复加入 total。
- [x] Codex 不再写 run-final fallback summary；其他 runtimes 行为不回归。
- [x] 旧 Codex run-summary rows 被删除且不会混入新统计。
- [x] Recovery 只读取 Cradle-owned Codex runtime home，不读取用户全局 archives。
- [x] 无法确定 turn/model 的 event 不写入正式统计，并产生可诊断 incident。
- [x] Session、model、session × model 与 date 查询全部来自同一份 `usage_logs`。
- [x] 多次 model calls 不放大 `totalTurns` 或任何 turn-count 字段。
- [x] 不存在 `/usage/local-summary`、`UsageLocalSummary`、Claude local archive reader 或 machine-local summary。
- [x] 不新增 single-writer、retention、rollup、watcher 或平行 usage table。
- [x] Server/Web typecheck、focused tests、scoped lint、module/API boundaries 与 diff integrity 通过；full Server/lint gates 已执行，剩余失败均在本计划范围外并记录于 `plans/README.md`。

## 停止条件

出现任一情况必须停止并报告：

- Operator 对 Plan 053 的移除尚未完成，旧 machine-local API/UI/source 仍存在。
- `thread/tokenUsage/updated` 不再提供非空 `threadId`、`turnId`、`last` 或 `total`。
- 真实 Cradle Codex trace 显示 `last` 不是单次模型调用 usage，或相同 cumulative checkpoint 会代表不同调用。
- Subagent 可以在没有可观察 `model/rerouted`/model identity 的情况下使用不同 model。
- Cradle-owned rollout 内无法用 `session_meta` + `turn_context` + `token_count` 确定 event 的
  thread/turn/model/timestamp。
- Live notification 与 rollout 无法生成同一个 deterministic identity。
- 正确实现需要读取用户全局 `~/.codex`、使用时间/CWD heuristic、写 `unknown` model 或新增平行事实表。
- DB migration 无法区分旧 Codex rows 与其他 runtime rows。
- 并行 chat-runtime work 已改变 `StreamTurnInput`、Provider notification 或 TurnExecutor lifecycle seam，导致本计划
  摘录不再成立。
- 任一验证 gate 在合理修复后连续失败两次。

## 维护说明

- 每次 Codex app-server protocol regeneration 都要复核 usage notification、model reroute 与 thread ancestry
  fixtures；generated files 不手改。
- 新 Provider 只有在能输出同等级 typed per-call event 时才迁移到 `provider-events` accounting；不得因为 Codex
  已完成而猜测其他 Provider semantics。
- `usage_logs.id` 对 provider-events 是 stable event identity，对 legacy run-summary runtimes 仍可暂用 UUID；未来
  迁移其他 runtime 时沿用同一 interface，不新建第二张事实表。
- 数据量按模型调用次数增长，不按 Token 数增长；达到 1M rows 或 1 GB 前不引入 rollup/retention。
- Reviewer 重点检查：Codex required dimensions、reroute model、live/recovery identity parity、final fallback 删除，以及
  `COUNT(*)` 是否仍被错误用于 turn semantics。
