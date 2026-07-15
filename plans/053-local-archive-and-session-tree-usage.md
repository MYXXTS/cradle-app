# Plan 053：以本机 Archive 与 Codex Session Tree 作为权威 Usage 来源

> **执行者说明**：严格按步骤执行，每一步都运行对应验证命令并确认预期结果。
> 命中「停止条件」时必须停止并报告，不得自行猜测或扩展范围。完成后更新
> `plans/README.md` 中本计划的状态；若 reviewer 明确表示由其维护索引，则不要修改状态。
>
> **漂移检查（首先运行）**：
>
> ```bash
> git diff --stat 3fad235..HEAD -- \
>   apps/server/src/modules/usage \
>   apps/server/src/modules/chat-runtime-providers/codex \
>   apps/server/src/modules/chat-runtime-providers/claude-agent \
>   apps/server/src/modules/chat-runtime/model/ui-slot-schemas.ts \
>   apps/server/tests/usage.test.ts \
>   packages/chat-runtime-contracts/src/index.ts \
>   apps/web/src/features/usage \
>   apps/web/src/features/chat/capabilities/chat-capabilities.ts \
>   apps/web/src/features/chat/context/context-usage-detail-panel.tsx \
>   apps/web/src/locales/default/usage.ts \
>   apps/web/src/api-gen
> ```
>
> 若任何范围内文件已变化，先将「当前状态」中的摘录与现有代码逐项比较；语义不一致时按停止条件处理。

## 状态

- **优先级**：P0
- **工作量**：L
- **风险**：MED
- **依赖**：无
- **类别**：bug、direction、tests、docs
- **计划基线**：commit `3fad235`，2026-07-15
- **取代计划**：`plans/025-usage-authoritative-fields.md`

## 为什么需要做

当前 Usage Dashboard 聚合 `usage_logs`，而 Codex provider 在 run 结束时只暴露最近一次模型请求的
`lastUsage`。一次 Codex thread 可以执行多轮模型请求并创建独立 subagent threads，因此这个数字会严重漏计。

把 `tokenUsage.total` 写到每一个 run 也不正确：它是 Codex thread 的 lifetime cumulative counter，
后续 run 的值已经包含之前 run，逐 run 写入会重复计算历史 Token。现有 Plan 025 正是这个错误方向，
因此本计划明确取代它。

完成后，Cradle 提供两个边界清晰的数据产品：

1. **Machine usage**：直接读取本机 Provider 原生 archive，不建立 Token 明细表；覆盖 Cradle 内外的
   Codex 与 Claude 使用量。
2. **Current session usage**：Codex 当前 root thread 加上任意深度、由原生 ancestry 明确归属的
   descendants；UI 将 lifetime processed total 与 root 当前 context window 分开显示。

现有 `usage_logs` 保留为 **Cradle-attributed activity**，继续回答 Cradle 记录到的 agent、model、
provider target 与成本分析，但不再被描述为本机权威总量。

## 不可漂移的产品语义

### Machine usage

- 一个 Codex rollout/session JSONL 文件只计一次。
- Codex 读取最后一条有效 `event_msg` / `token_count` 的 `info.total_token_usage`。
- Claude 没有等价的 cumulative footer，因此累加唯一的 `assistant.message.usage` 与
  `toolUseResult.usage`。
- Codex `cached_input_tokens` 是 input 子集；`reasoning_output_tokens` 是 output 子集，均不得再次加入
  `totalTokens`。
- Claude 的 `input_tokens`、`cache_creation_input_tokens` 与 `cache_read_input_tokens` 是独立字段，
  三者都属于 processed input；output 只加入一次。
- 第一版只承诺 lifetime total 与 last activity，不把 session lifetime 错称为最近 24h/30d 新增量。
- Usage API 与日志不得暴露 prompt、response、archive path、home path、credential 或 transcript 内容。

### Current Codex session

- `compact.total`：root thread cumulative usage。
- `compact.last`：root 最近一次请求，用于 context fallback。
- `compact.treeTotal`：root 加全部 descendants 的 cumulative usage。
- `compact.subagentTotal`：descendants cumulative usage。
- `compact.subagentCount`：由 Codex 原生 ancestry 发现的 descendants 数量。
- 只能使用 `ancestorThreadId` / `parentThreadId` 归属 child；禁止根据 cwd、时间、model、host process
  或相似 `sessionId` 推断。
- 同一 thread 的新 cumulative notification 覆盖旧值，绝不能把 notifications 相加。
- context percentage 永远只使用 root context，禁止计算 `treeTotal / modelContextWindow`。

## 当前状态

### Dashboard 只读取 `usage_logs`

`apps/server/src/modules/usage/service.ts:119-134` 的 summary 直接聚合数据库：

```ts
const totals = db().get<{
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  count: number
}>(sql`
  SELECT
    COALESCE(SUM(${usageLogs.promptTokens}), 0) AS prompt_tokens,
    COALESCE(SUM(${usageLogs.completionTokens}), 0) AS completion_tokens,
    COALESCE(SUM(${usageLogs.totalTokens}), 0) AS total_tokens,
    COUNT(*) AS count
  FROM ${usageLogs}
`)
```

`apps/web/src/features/usage/README.md` 也把 `usage_logs` 描述为 Dashboard 唯一来源。
`use-usage-overview.ts` 仍直接 import generated client；新实现必须迁移到 feature-owned
`features/usage/api/` gateway，遵循 `apps/web/src/features/README.md`，参考
`apps/web/src/features/settings/api/preferences.ts`。

### Codex 已收到 total 与 last，但 run 只保存 last

生成协议 `app-server-protocol/v2/ThreadTokenUsage.ts` 定义：

```ts
export type ThreadTokenUsage = {
  total: TokenUsageBreakdown
  last: TokenUsageBreakdown
  modelContextWindow: number | null
}
```

`provider.ts:1872-1880` 当前只读取 `last`：

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

`turn-executor.ts:435-452` 在 run finalization 写一次 `totalUsage ?? lastUsage`。不得把 Codex
thread-lifetime `total` 接到这个入口；该路径只保留 Cradle-attributed analytics。

### Codex 已提供确定性的 descendant 查询

- `ThreadListParams.ts:55-63` 支持 `ancestorThreadId`，返回任意深度 spawned descendants。
- `Thread.ts:23-33` 暴露 `parentThreadId`。
- `ui-slot-projector.ts:1026-1107` 已为 Crew UI 分页调用 `thread/list`，但目前只筛直接 child 且只请求
  `subAgentThreadSpawn`。
- `turn/stream-handler.ts:111-150` 在过滤 root thread 之前调用 `onProviderNotification`，可确定性捕获
  child `thread/started` 与 `thread/tokenUsage/updated`。

### Compact contract 只有 root usage

- `packages/chat-runtime-contracts/src/index.ts:373-389`
- `apps/server/src/modules/chat-runtime/model/ui-slot-schemas.ts:109-125`
- `apps/web/src/features/chat/capabilities/chat-capabilities.ts:143-159`

这三处只定义 `total` 与 `last`。`context-usage-detail-panel.tsx:491-493` 当前选择 root 最近请求作为
context fallback：

```ts
function readCompactWindowUsage(compactState: ChatRuntimeCompactUiSlotState) {
  return compactState.last.totalTokens > 0 ? compactState.last : compactState.total
}
```

该行为必须保留；session tree processed total 是另一个展示维度。

### 已有 Provider Home resolver

- `codex/app-server/runtime-home.ts:5-20` 负责 Cradle Codex home。
- `claude-agent/runtime-context.ts:62-78` 负责 Cradle Claude home。

Usage 模块必须复用这些 resolver，不得复制 `CRADLE_DATA_DIR` / `CRADLE_DB_PATH` 优先级。

## 目标架构

```text
Machine usage
  Usage service
    └── LocalUsageSource registry
        ├── Codex source
        │   ├── ~/.codex/sessions/**/*.jsonl
        │   ├── Cradle Codex home/sessions/**/*.jsonl
        │   └── distinct CODEX_HOME/sessions/**/*.jsonl
        └── Claude source
            ├── ~/.claude/projects/<project>/*.jsonl
            ├── Cradle Claude home/projects/<project>/*.jsonl
            └── distinct CLAUDE_CONFIG_DIR/projects/<project>/*.jsonl

Current Codex session
  root thread
    ├── thread/tokenUsage/updated.total
    └── thread/list({ ancestorThreadId: root })
        ├── child archive/live total
        └── nested descendant archive/live total
             ↓
        compact.treeTotal / compact.subagentTotal
             ↓
        Chat "Session processed"
```

两条路径共享 Provider-native parser 与 Token arithmetic，不共享数据库行。各自可持有短期内存缓存。

## 目标 Contract

### Local archive summary

在 `apps/server/src/modules/usage/local/` 创建 contract，复用现有
`RuntimeTokenUsageBreakdown`，不得再定义一个相同 shape：

```ts
import type { RuntimeTokenUsageBreakdown } from '@cradle/chat-runtime-contracts'

interface LocalUsageProviderSummary {
  providerKind: 'codex' | 'claude-agent'
  status: 'available' | 'unavailable' | 'error'
  sourceRootCount: number
  sessionCount: number
  lastActivityAt: number | null
  usage: RuntimeTokenUsageBreakdown
}

interface LocalUsageSnapshot {
  generatedAt: number
  usage: RuntimeTokenUsageBreakdown
  providers: LocalUsageProviderSummary[]
}

interface LocalUsageSource {
  readonly providerKind: LocalUsageProviderSummary['providerKind']
  readSummary(): Promise<LocalUsageProviderSummary>
}
```

只有所有 candidate roots 都不可读时才是 `unavailable`；至少一个 distinct root 可读即为
`available`，即使其他 roots 缺失。可读但没有 session 是 available + zero totals。发现 roots 后因 I/O
或 parser 失败无法形成可靠 summary 才是 `error`。单个 Provider 失败不能使整个 snapshot 失败。

### Compact/session-tree state

给 `RuntimeCompactUiSlotState` 及 server/web mirrors 增加 required fields：

```ts
treeTotal: RuntimeTokenUsageBreakdown
subagentTotal: RuntimeTokenUsageBreakdown
subagentCount: number
```

无独立 thread tree 的 Provider 必须投影：

```ts
treeTotal: total
subagentTotal: zeroUsage
subagentCount: 0
```

不要把字段设为 optional 并让 renderer 猜 fallback；这是一次同步更新所有 producer/consumer 的 breaking refactor。

## 适用约定

- Provider-native archive parsing 放在各 provider namespace：Codex parser 位于 `codex/`，Claude parser
  位于 `claude-agent/`；`usage/local/` 只编排公开 reader。
- Route 使用 Elysia + TypeBox，并提供 `x-cradle-cli` metadata。
- Web server state 通过 `features/<domain>/api/` gateway 进入 feature；不新增 raw `fetch()` 或 Zustand store。
- UI 遵循 `packages/design-system/SKILL.md` 与 `CHEATSHEET.md`：static Tailwind、`cn()`、sentence case、
  semantic text tiers、surface texture；不得扩展 Usage 页面现有 ambient glow 例外。
- 测试使用 Vitest；HTTP 结构参考 `apps/server/tests/usage.test.ts`，Codex fake app-server 参考
  `codex/provider.test.ts`。
- 所有新代码、标识符、注释、测试名、commit message 与 UI copy 使用 English。

## 需要的命令

| 目的 | 命令 | 成功标准 |
| --- | --- | --- |
| 生成 Web API | `pnpm --filter @cradle/web generate` | exit 0；client 包含 local summary route |
| Archive tests | `pnpm --filter @cradle/server exec vitest run src/modules/chat-runtime-providers/codex/usage-archive.test.ts src/modules/chat-runtime-providers/claude-agent/usage-archive.test.ts src/modules/usage/local/service.test.ts` | 全部通过 |
| Codex tests | `pnpm --filter @cradle/server exec vitest run src/modules/chat-runtime-providers/codex/projection/session-tree-usage.test.ts src/modules/chat-runtime-providers/codex/provider.test.ts` | 全部通过 |
| Usage HTTP | `pnpm --filter @cradle/server exec vitest run tests/usage.test.ts` | 全部通过 |
| Web focused | `pnpm --filter @cradle/web exec vitest run --config vite.config.ts --environment jsdom src/features/usage/usage-local-summary.test.tsx src/features/chat/context/context-usage-detail-panel.test.tsx` | 全部通过 |
| Server check | `pnpm --filter @cradle/server typecheck` | exit 0，包含 boundary check |
| Web check | `pnpm --filter @cradle/web typecheck` | exit 0，包含 API boundary check |
| i18n | `pnpm --filter @cradle/web i18n:ci` | exit 0 |
| Full server | `pnpm --filter @cradle/server test` | 全部通过 |
| Full web | `pnpm --filter @cradle/web test` | 全部通过 |
| Lint | `pnpm lint` | exit 0，或仅有明确记录的范围外既有问题 |
| Diff | `git diff --check` | 无输出，exit 0 |

本计划不需要新 dependency；除非依赖确实缺失，否则不要运行 `pnpm install`。

## 建议执行工具

- 修改 Elysia route、TypeBox model、OpenAPI 与 server README 前读取
  `.agents/skills/server-app-development/SKILL.md`。
- 修改 Codex projection 前读取 `.agents/skills/cradle-chat-runtime-sdk-update/SKILL.md`；本计划不修改或
  regenerate generated protocol。
- 实现 UI 前读取 `packages/design-system/SKILL.md`、`CHEATSHEET.md` 与
  `references/anti-patterns.md`。
- 若环境提供 `vercel-react-best-practices`，用它复核 React Query 与 render 边界。

## 范围

**新增文件：**

- `apps/server/src/modules/chat-runtime-providers/codex/usage-archive.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/usage-archive.test.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/projection/session-tree-usage.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/projection/session-tree-usage.test.ts`
- `apps/server/src/modules/chat-runtime-providers/claude-agent/usage-archive.ts`
- `apps/server/src/modules/chat-runtime-providers/claude-agent/usage-archive.test.ts`
- `apps/server/src/modules/usage/local/contract.ts`
- `apps/server/src/modules/usage/local/service.ts`
- `apps/server/src/modules/usage/local/service.test.ts`
- `apps/server/src/modules/usage/local/sources/codex.ts`
- `apps/server/src/modules/usage/local/sources/claude-agent.ts`
- `apps/web/src/features/usage/api/usage.ts`
- `apps/web/src/features/usage/usage-local-summary.tsx`
- `apps/web/src/features/usage/usage-local-summary.test.tsx`
- `apps/web/src/features/chat/context/context-usage-detail-panel.test.tsx`

**现有文件：**

- `apps/server/src/modules/usage/{index.ts,model.ts,README.md}`
- `apps/server/tests/usage.test.ts`
- `apps/server/src/modules/chat-runtime-providers/codex/{provider.ts,provider.test.ts,README.md}`
- `apps/server/src/modules/chat-runtime-providers/codex/projection/{ui-slot-projector.ts,state-projector.ts}`
- `apps/server/src/modules/chat-runtime-providers/claude-agent/context-usage-projector.ts`
- `packages/chat-runtime-contracts/src/index.ts`
- `apps/server/src/modules/chat-runtime/model/ui-slot-schemas.ts`
- `apps/web/src/features/chat/capabilities/chat-capabilities.ts`
- `apps/web/src/features/chat/context/{context-usage-detail-panel.tsx,context-window-viewer.tsx}`
- `apps/web/src/features/chat/composer/use-chat-composer-runtime.ts`
- `apps/web/src/features/chat/slash-commands/chat-slash-commands.ts`
- `apps/web/src/features/usage/{use-usage-overview.ts,usage-dashboard.tsx,usage-hero-cards.tsx,README.md}`
- `apps/web/src/locales/default/usage.ts`
- 仅由 generator 修改的 `apps/web/src/api-gen/`
- `plans/README.md`

若 required compact fields 导致其他直接 producer/test 编译失败，只能补充该直接 producer/test，并在 handoff
明确列出；不得借机扩大 Chat UI 重构。

**范围外：**

- DB schema、Drizzle migration、usage event table、persistent cursor。
- 删除 `usage_logs`、`step_usage` 或现有 cost/attribution queries。
- 将 Codex `tokenUsage.total` 写入每个 run-final `usage_logs` row。
- 精确 daily/hourly archive usage、archive cost、外部 session 的 model/agent/provider-target attribution。
- watcher、background polling、cross-device sync、permanent index。
- 修改 Synara 或任何 Cradle namespace 外文件。
- `account/usage/read` 等 account quota/rate-limit API。
- 猜测 OpenCode、Gemini、Cursor、ACP 等格式；没有权威 parser 就保持 unsupported。
- Plan 052 的 Codex host ownership 重构。
- 没有原生 descendant relation 的 title、side-chat、compact、review helper usage。

## Git 工作流

- Branch：`advisor/053-local-archive-session-tree-usage`
- 建议 commits：

```text
feat(server): read authoritative local usage archives
feat(chat): aggregate codex session tree usage
feat(web): distinguish local and attributed usage
```

- 未经 operator 明确要求，不 push、不创建 PR。
- 计划定稿时以下范围外路径已有修改，必须原样保留：
  - `apps/desktop/src/preload/index.ts`
  - `apps/server/src/modules/issue-agent/`
  - `apps/server/src/modules/session-await/`
  - `apps/server/src/modules/work/`
  - `apps/server/tests/issue-agent.test.ts`
  - `apps/server/tests/session-await-github.test.ts`
  - `apps/web/src/features/chat/composer/composer.tsx`
  - `apps/web/src/features/chat/composer/pasted-text*`
  - `apps/web/src/features/chat/pasted-text/`
  - `apps/web/src/features/chat/rendering/`
  - `apps/web/src/features/chat/session/read-user-message-draft.ts`
  - `apps/web/src/features/chat/ui/`
  - `apps/web/src/features/work/`
  - `apps/web/src/features/workspace/`
  - `apps/web/src/hooks/use-composer-draft-sync.ts`
  - `apps/web/src/locales/{default,en-US,es-ES,ja-JP,zh-CN}/chat.*`
  - `apps/web/src/store/composer-draft.ts`

  执行前保存完整 `git status --short` 作为 baseline。若 required compact contract 变更必须触碰上述
  dirty file，停止并让 operator 先合并/提交对应工作；不得在其上叠加本计划修改。

## 执行步骤

### Step 1：实现 Provider-native archive parser

创建 `codex/usage-archive.ts`，声明最小 native record 类型，并导出：

```ts
interface CodexArchiveUsageSummary {
  sessionId: string | null
  occurredAt: number
  usage: RuntimeTokenUsageBreakdown
}

async function readCodexArchiveUsage(path: string): Promise<CodexArchiveUsageSummary | null>
```

要求：

1. 从文件尾部查找最后一个有效 `event_msg` / `token_count`；损坏或未 flush 的尾行不能遮蔽之前有效事件。
2. 读取 `info.total_token_usage`，session lifetime 禁止使用 `last_token_usage`。
3. 优先使用 provider `total_tokens`；缺失时才用 `inputTokens + outputTokens`。
4. 保留 cached/reasoning breakdown，但不加入 total 第二次。
5. 不返回/记录 transcript 内容。

创建 `claude-agent/usage-archive.ts`：

1. 只扫描 `projects/<project>/*.jsonl` 顶层 transcripts；父 transcript 已通过
   `toolUseResult.usage` 表达 subagent usage 时，不递归重复读取 nested subagent transcripts。
2. 读取 `assistant.message.usage` 与 `toolUseResult.usage`。
3. 去重 key 优先级：`requestId`、message id、UUID、agent id、file+line fallback。
4. 累加 `input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens`；若有明确
   `total_tokens`，使用 provider total。
5. 仅返回数值 summary；JSON guard 集中在 provider parser 内，不把 `unknown` guard 散落到调用链。

测试覆盖：Codex final cumulative、cached/reasoning 不重复、损坏尾行；Claude assistant/tool result、
stable dedupe、cache fields、无关损坏行。

**验证：**

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/codex/usage-archive.test.ts \
  src/modules/chat-runtime-providers/claude-agent/usage-archive.test.ts
```

预期：全部 parser tests 通过。

### Step 2：实现无数据库的 Machine Usage Service

在 `usage/local/` 定义 source registry、root discovery、cache 与 aggregation。

Codex roots：

1. `~/.codex/sessions`
2. `resolveCodexAppServerHome()/sessions`
3. distinct `process.env.CODEX_HOME/sessions`

Claude roots：

1. `~/.claude/projects`
2. `resolveClaudeAgentSdkConfigDir()/projects`
3. distinct `process.env.CLAUDE_CONFIG_DIR/projects`

存在的 root 用 `realpath` canonicalize；不存在的使用 normalized absolute path。symlink 指向同一 root 时只计一次。
任一 Provider 失败不得影响另一个 Provider。

只实现两层内存 cache：

- 30 秒 whole-snapshot TTL，并 coalesce concurrent requests。
- per-file memo key 为 canonical path + `size` + `mtimeMs`。

每次 discovery 删除已不存在文件的 memo；file reading concurrency 固定为 module-private `16`。不添加 watcher、
cursor 或 table。`sessionCount` 是成功解析的 native files 数，不是 Cradle run 数。

测试覆盖 multi-home、symlink dedupe、Provider failure isolation、file memo hit/invalidation、API result 不含 path、
machine total 等于 Provider totals 求和。

**验证：**

```bash
pnpm --filter @cradle/server exec vitest run src/modules/usage/local/service.test.ts
```

预期：无需初始化 Cradle DB，全部 tests 通过。

### Step 3：发布 Local Usage API

在 Usage route 增加：

```ts
detail: {
  summary: 'Get local provider archive usage summary',
  'x-cradle-cli': { command: ['usage', 'local-summary'] },
}
```

路径为 `GET /usage/local-summary`，response 使用 TypeBox。保留所有现有 `usage_logs` routes。

更新 Usage README，明确 machine archive 与 attributed analytics 的边界。扩展
`apps/server/tests/usage.test.ts`：在 temp `CRADLE_DATA_DIR` 创建 synthetic Codex/Claude archives，验证
HTTP schema、总量与 privacy boundary。

**验证：**

```bash
pnpm --filter @cradle/server exec vitest run tests/usage.test.ts
pnpm --filter @cradle/server typecheck
```

预期：tests、typecheck、module boundary 均通过。

### Step 4：聚合 Codex 完整 Descendant Tree

创建 `codex/projection/session-tree-usage.ts`。使用分页 native query：

```ts
client.request('thread/list', {
  ancestorThreadId: rootThreadId,
  sourceKinds: [
    'subAgent',
    'subAgentReview',
    'subAgentCompact',
    'subAgentThreadSpawn',
    'subAgentOther',
  ],
  archived,
  sortKey: 'updated_at',
  sortDirection: 'desc',
})
```

分别查询 `archived: false` 与 `archived: true`，遍历所有 cursor，并防止 repeated cursor loop；按
`thread.id` 合并。只信任 native `ancestorThreadId` 结果。

每个 thread 的 total 优先级：

1. 该 thread 最新 live `tokenUsage.total`。
2. `Thread.path` 对应 archive 的 final total。
3. 无数据则贡献 0，但仍计入 `subagentCount`。

`Thread.path` 必须 canonicalize 且位于已发现 Codex session roots 内；越界 path 不读取，只允许使用 live total，
避免把 native metadata 变成任意文件读取入口。

Crew 与 usage 复用一次 descendants list；Crew 可继续只展示相关直接 agents，usage 必须包含全部 descendants。

在 `readTurnNotifications` 已有 pre-filter callback 中处理：

- `thread/started` 注册明确 parent relation；
- `thread/tokenUsage/updated` 覆盖 exact thread cumulative total；
- unrelated/unknown thread 不归属；
- duplicate notification 幂等。

live overlay 只绑定 active/resolved runtime session；provider snapshot 仅保存 aggregate，不保存 per-child events/path。
若没有确定性 cleanup seam，overlay 限定在 stream/getUiSlotStates operation，禁止添加任意 LRU。重启后由 archive hydrate。

测试覆盖 root-only、direct child、grandchild、archived、pagination/repeated cursor、replace-not-add、unrelated exclusion、
pathless live child、pathless unknown child、subset arithmetic、new provider instance hydration。

**验证：**

```bash
pnpm --filter @cradle/server exec vitest run \
  src/modules/chat-runtime-providers/codex/projection/session-tree-usage.test.ts \
  src/modules/chat-runtime-providers/codex/provider.test.ts
```

预期：全部 focused Codex tests 通过。

### Step 5：扩展 Compact Contract

同步修改 shared contract、server schema、Codex/Claude projectors、renderer mirror 与所有直接 producers。

Codex 投影 `total`、`last`、`treeTotal`、`subagentTotal`、`subagentCount`；其他 Provider 使用 required
zero-subagent fallback。增加 schema/contract tests，缺字段必须失败。server contract 编译通过后再生成 Web API。

**验证：**

```bash
pnpm --filter @cradle/server typecheck
pnpm --filter @cradle/web generate
pnpm --filter @cradle/web typecheck
```

预期：全部 exit 0；generated compact type 含三个 required fields。

### Step 6：在 Usage Dashboard 区分 Machine 与 Attributed Usage

创建 `features/usage/api/usage.ts`，把 `use-usage-overview.ts` 的 generated imports 全部迁入 gateway，并加入
local summary query。两组 readiness 独立：local loading/error 不阻断 attributed analytics，反之亦然；禁止合并 totals。

创建 `usage-local-summary.tsx`，展示：

- `Local archive total`
- Codex/Claude availability、session count、last activity、total
- `Local session archives` source label
- 不泄露 path 的 unavailable/error state

将它放在 Dashboard 首要位置。现有 heatmap、cost、streak、agent/model/provider-target sections 归入
`Cradle-attributed activity`，说明只覆盖 Cradle recorded runs；现有 `Total tokens` 改为
`Attributed tokens`。range selector 只影响 attributed analytics。

复用现有 `SectionCard`、`Skeleton` 与 number formatter，不新增 universal primitive。

测试覆盖 independent loading、local unavailable、labels、provider rows、无 path 泄漏。

**验证：**

```bash
pnpm --filter @cradle/web exec vitest run \
  --config vite.config.ts \
  --environment jsdom \
  src/features/usage/usage-local-summary.test.tsx
pnpm --filter @cradle/web typecheck
```

预期：focused test 与 Web boundary check 通过。

### Step 7：在 Chat UI 显示包含 Subagents 的 Session Processed

在 context detail/viewer 中明确展示：

```text
Context
84K / 200K

Session processed
2.4M tokens
Main thread 1.6M · 4 subagents 800K
```

context rows、progress、remaining 与 percentage 继续使用 root context/`last`；`Session processed` 使用
`treeTotal`，breakdown 使用 root `total` + `subagentTotal` + `subagentCount`。tree total 不显示 percentage 或
context denominator，compact 后仍保留 lifetime value。slash/composer context labels 不得悄悄改成 tree total。

测试覆盖 root-only、nested subagents、`last < total < treeTotal`、unknown context limit。

**验证：**

```bash
pnpm --filter @cradle/web exec vitest run \
  --config vite.config.ts \
  --environment jsdom \
  src/features/chat/context/context-usage-detail-panel.test.tsx
pnpm --filter @cradle/web typecheck
```

预期：session tree 可见，但不会被渲染成 context percentage。

### Step 8：文档与全量验证

更新 Usage、Codex、Claude/Web feature README，记录 ownership、archive semantics、live freshness 与 descendant
relation。Codex README 不再暗示 `usage_logs` 是唯一 usage path。Plan 025 必须保持 superseded。

运行：

```bash
pnpm --filter @cradle/server typecheck
pnpm --filter @cradle/web typecheck
pnpm --filter @cradle/web i18n:ci
pnpm --filter @cradle/server test
pnpm --filter @cradle/web test
pnpm lint
git diff --check
git status --short
```

预期：typecheck、boundaries、i18n、focused/full tests 通过；lint 通过或仅报告范围外既有问题；diff check 无输出；
范围外 dirty files 未被修改。

## 测试计划

- **Parser/service**：Codex final cumulative、malformed tail、subset fields；Claude assistant/tool result、dedupe、
  cache arithmetic；multi-home、symlink dedupe、failure isolation、cache invalidation、privacy。
- **Session tree**：direct/nested/archived descendants、pagination、live replacement、unrelated exclusion、pathless child、
  archive recovery、aggregate arithmetic。
- **Web**：local/attributed independent state、明确 labels、context/session divergence、subagent breakdown。
- 不增加 browser E2E；关键路径由 server integration + focused component tests 覆盖。

## 完成标准

- [ ] Machine total 无需 DB，来自全部 distinct Codex/Claude archive roots。
- [ ] Codex 每文件只读取一个 final cumulative total。
- [ ] Claude 累加唯一 assistant/tool-result usage，cache semantics 正确。
- [ ] Cached input 与 reasoning output 从不重复加入 total。
- [ ] `GET /usage/local-summary` Provider failure-isolated，且不暴露 path/content。
- [ ] 现有 `usage_logs` routes 仍通过测试，并在 UI 标为 Cradle-attributed。
- [ ] Codex `treeTotal` 包含 root 与任意深度、含 archived 的 native descendants。
- [ ] Duplicate cumulative notifications 使用 replace，不使用 add。
- [ ] Context percentage 保持 root-only。
- [ ] Chat UI 显示 `Session processed` 与 main/subagent breakdown。
- [ ] 无 tree Provider 提供 required zero-subagent fallback。
- [ ] Usage components 通过 `features/usage/api/` 访问 generated API。
- [ ] 未新增 schema migration、usage table、watcher、persistent cursor。
- [ ] Server/Web typecheck、boundaries、focused/full tests、i18n 与 diff integrity 通过。
- [ ] `plans/README.md` 将 053 标为 DONE，025 保持 superseded。

## 停止条件

出现任一情况必须停止并报告：

- 当前 Codex 协议不再提供 `ancestorThreadId`、`parentThreadId`、`Thread.path` 或
  `thread/tokenUsage/updated.total`。
- 当前真实 rollout 证明 final `total_token_usage` 不是 thread/session cumulative。
- 当前真实 Claude transcript 显示 parent `toolUseResult.usage` 与顶层 assistant records 重叠，且稳定 ID 无法去重；
  只能提交脱敏 structural trace，不得猜。
- 产品改为要求精确 daily/hourly machine usage 或 archive-derived cost；需拆分 incremental-event 计划。
- 正确性需要 DB schema、persistent index、watcher 或 heuristic child association。
- child 无法由 native ancestry 归属；排除并报告 upstream gap，不得使用 cwd/time/model/process 猜测。
- Plan 052 先落地并替换 notification/host ownership；重新做 drift check，把 live overlay 移到新的 provider-owned pump，
  禁止恢复 session-scoped host。
- API generation 修改无关 endpoints，或必须手改 generated code 才能掩盖 server mismatch。
- 某验证 gate 在合理范围修复后连续失败两次。
- 实现需要触碰范围外 domain，且不是 required compact producer 或 generated artifact。

## 维护说明

- 新增 Provider 时必须先有 provider-owned authoritative archive parser，再注册 `LocalUsageSource`；无法确认就显示
  unsupported，不做估算。
- 只有实际测得 archive scan 性能不足时，才在独立计划中为现有 source contract 添加 persistent index。
- 每次 Codex protocol regeneration 都要复核 `usage-archive.ts` 与 `session-tree-usage.ts`。
- Plan 052 reviewer 必须保留 pre-filter descendant notification observation，或迁移到 provider-owned pump。
- Machine total 与 `usage_logs` 回答不同问题，后续 UI 不得把它们合并。
- `treeTotal` 是 processed work，不是 context occupancy，也不等同于 billable cost。
