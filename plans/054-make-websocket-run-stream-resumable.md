# Plan 054: 让 WebSocket run stream 可检测断线并按业务 cursor 恢复

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 3fad235..HEAD -- packages/chat-runtime-contracts/src/sync-protocol.ts apps/server/src/modules/sync-gateway apps/server/src/modules/chat-runtime/run-registry.ts apps/server/src/modules/chat-runtime/run apps/server/src/modules/chat-runtime/stream apps/server/tests/sync-websocket.test.ts apps/web/src/lib/sync-socket apps/web/src/features/chat/transport/chat-stream-transport.ts`
> If any in-scope file changed, compare the current-state excerpts and protocol
> invariants below against the live code. A semantic mismatch is a STOP
> condition; line-number-only drift is not.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/024-chat-native-event-sourcing.md` (DONE), `plans/040-establish-web-state-authority.md` (DONE)
- **Category**: bug, tests, tech-debt
- **Planned at**: commit `3fad235`, 2026-07-15

## Why this matters

Web 内页的 multiplex WebSocket 可能处于浏览器仍报告 `OPEN`、但已不再收包的
half-open 状态。当前客户端每 25 秒发送 ping，却忽略 pong 且没有 deadline，因此不会
主动 close/reconnect；用户刷新页面重新建连后才恢复，表现为 tool input 已显示而 output
和后续 assistant chunks 永久缺失。

即使 socket 被关闭，现有 resume 仍不正确：sync gateway 给每次 subscription 临时生成
transport `seq`，Web 却把它保存为 run chunk cursor；重连后的临时序号与 mutable
`chunkBuffer` 下标都不具备跨 subscription 稳定性，会跳过或重复真实 chunks。目标状态是：
transport 只负责有界发送，`run-chunks` channel 自己拥有 `{ runId, cursor }`；客户端能检测
half-open、关闭失活 generation、重连并从最后确认的业务 cursor 恢复。无法无损 replay
时必须显式要求 snapshot recovery，不得静默假装 stream 正常结束。

这是 Plan 014 的后续协议重构，不重开 Plan 014 已完成的 malformed-frame 与旧
EventSource 恢复工作。

## Incident evidence

本计划对应已核对的现场：Issue `CR1-118`，session
`0f56ebba-548e-48bd-93df-147c9a3513e4`，run
`74212caf-683e-4199-8b35-971e915ea730`。页面最后显示的 tool input 时间为
`16:49:37.535`；服务端在 `16:50:04`、`16:50:21` 继续生成 chunks；截图时间为
`16:50:25`；对应 tool output 在 `16:50:28.463` 已存在。Run snapshot 中 119 个 tool
inputs 均有 119 个 outputs。刷新后 UI 恢复，且用户确认不是滚动未跟随。

这些证据证明服务端 run 没有停在 tool input，缺失发生在 live delivery/client connection
链路。代码证据进一步确认该链路缺少 half-open detection，并存在确定性的 cursor 错配。
没有逐 packet capture 时，不应把某一次网络中断的物理原因写成 100% 已知；但下述两个
代码缺陷及其“收包停住且刷新恢复”的失败模式是确定的。

## Current state

### 1. Client ping 没有 liveness 语义，旧 socket 事件也没有 generation 隔离

`apps/web/src/lib/sync-socket/client.ts:16-28,129-152,164-204,231-244`：

```ts
const PING_INTERVAL_MS = 25_000

let socket: WebSocket | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null

currentSocket.addEventListener('open', () => {
  reconnectAttempt = 0
  startPingTimer()
  resubscribeAll()
  resolve()
}, { once: true })
currentSocket.addEventListener('message', handleSocketMessage)
currentSocket.addEventListener('close', handleSocketClose)

if ('op' in frame) {
  return
}

function startPingTimer(): void {
  clearPingTimer()
  pingTimer = setInterval(() => {
    sendClientFrame({ op: 'ping', ts: Date.now() })
  }, PING_INTERVAL_MS)
}
```

Pong 被 `if ('op' in frame) return` 丢弃；没有 `pendingPingTs`、pong deadline 或主动
close。事件 handler 也没有核对产生事件的 socket generation，因此旧 socket 的迟到
`close` 可以清空新 socket 状态。

同文件 `:38-54,141-160` 在首次 open 时由 `resubscribeAll()` 发送全部订阅，同时
`subscribeSyncChannel(...).then(...)` 又发送当前订阅，存在重复初始 `sub`：

```ts
void ensureConnected().then(() => {
  if (subscriptions.get(frame.subId) === active && !active.ended) {
    sendClientFrame(buildResubFrame(active))
  }
})

currentSocket.addEventListener('open', () => {
  resubscribeAll()
  resolve()
}, { once: true })
```

### 2. Transport sequence 被错误地当作 run cursor

`apps/server/src/modules/sync-gateway/buffer.ts:20-75`：

```ts
let nextSeq = 0

const enqueue = (frame: SyncServerDataFrame) => {
  const sized = withSeq(frame, nextSeq++)
  pending.push(sized)
  flush()
}
```

该 `nextSeq` 每次 subscription 从 0 开始，且 `sub-ack` 虽不携带 `seq` 仍消耗
`nextSeq++`。它只能描述临时 sender 的发送顺序，不能描述 run 中的位置。

`apps/web/src/lib/sync-socket/adapters/chunk-stream.ts:51-66` 却把 frame `seq` 写回
subscription cursor：

```ts
if (frame.kind === 'chunk') {
  controller.enqueue(frame.replay
    ? replayChatStreamChunk(frame.chunk)
    : liveChatStreamChunk(frame.chunk))
  if ('seq' in frame && typeof frame.seq === 'number') {
    updateSyncSubscriptionCursor(subId, frame.seq)
  }
}
if (frame.kind === 'sub-ack') {
  updateSyncSubscriptionCursor(subId, frame.cursor)
}
```

### 3. 现有 replay buffer 可变，数组下标不是稳定 cursor

`apps/server/src/modules/chat-runtime/run-registry.ts:23-33` 将 replay 表示为可变数组、
coalesce index 和 front-eviction offset。`active-run-stream.ts:257-355` 会：

- 合并并原地替换 text/reasoning/tool-input delta；
- 将更新后的 `tool-output-available` 从原位置移动到 tail；
- 超过 cap 时从数组头部 `shift()`。

`apps/server/src/modules/chat-runtime/stream/session-run-chunk-sync.ts:29-46` 却直接以
数组下标生成 `seq`：

```ts
const chunks = active?.chunkBuffer ?? []
const startSeq = Math.max(0, Math.floor(afterChunkSeq) + 1)
return buildReplayFromIndex(chunks, startSeq)
```

因此 cursor 会随 coalescing、移动和淘汰改变，无法作为 reconnect token。

### 4. Empty active run 与 active-run 判断存在确定性错误

`session-run-chunk-sync.ts:45-61`：

```ts
const cursor = chunks.length > 0 ? chunks.length - 1 : Math.max(0, startSeq - 1)
return { items, cursor, live: chunks.length > 0 }

export function hasActiveSessionRun(sessionId: string): boolean {
  return runRegistry.getActiveRunIdForSession(sessionId) !== null
}
```

首 chunk 到达前 `chunks.length === 0` 会把真实 active run 标记为 closed；而 registry
getter 返回 `undefined`，所以 `!== null` 对无 active run 反而为 true。

### 5. 所有非 `error` end 都被当正常完成

`apps/web/src/lib/sync-socket/client.ts:186-194` 在收到任意 `end` 时先把 subscription
永久设为 `ended`；`chunk-stream.ts:68-76` 只有 `error` 会 error stream，
`backpressure`、`upstream-closed`、`snapshot-required`、`not-found` 都直接 close。
这会把可恢复的 delivery interruption 呈现为正常 EOF。

### 6. SSE 也消费同一 replay state

`apps/server/src/modules/chat-runtime/stream/live-run-streams.ts:45-67` 直接将
`active?.chunkBuffer` 传给 SSE replay。新 log 必须同时服务 SSE 与 WS，不能只在
sync gateway 复制一套 cursor buffer；但 SSE wire format 本身不需要增加 cursor。

## Target architecture and invariants

### Ownership

新增 chat-runtime-owned 深模块，例如
`apps/server/src/modules/chat-runtime/stream/run-chunk-log.ts`。它拥有 active run 的
observable event log、cursor allocation、bounded retention、atomic replay-to-live handoff。
`sync-gateway/buffer.ts` 只拥有 pending frame/byte backpressure，不拥有任何业务 cursor。

推荐核心 shape（可根据既有命名微调，不得改变语义）：

```ts
export interface SequencedRunChunk {
  runId: string
  cursor: number
  chunk: UIMessageChunk
  terminal: boolean
}

export type RunChunkReplay =
  | {
      kind: 'ready'
      runId: string
      items: SequencedRunChunk[]
      cursor: number
      live: boolean
    }
  | {
      kind: 'snapshot-required'
      runId: string
      latestCursor: number
    }
```

### Required invariants

1. Cursor belongs to one `runId`; it is meaningless without that identity.
2. Within one run, every chunk observable by a live subscriber gets one strictly increasing cursor.
3. An emitted entry is append-only. Never mutate, replace, reorder, or reuse its cursor after publication.
4. Runtime-level pending-delta batching may still merge data **before** publication. Replay-buffer
   coalescing after publication must be removed from the resumable log.
5. A bounded log may evict old entries. If requested cursor precedes retained history, return
   `snapshot-required`; never clamp the cursor or replay a plausible suffix as if it were complete.
6. Replay registration and live subscription are one atomic operation from the caller's perspective:
   an append racing with subscription appears exactly once, either in replay or live delivery.
7. An active run with zero chunks is `live: true` and remains subscribed.
8. If a client resumes `{ runId, cursor }` after that run was released, changed, or can no longer
   replay the cursor, return `snapshot-required`. The persisted Session/message snapshot is the
   recovery authority; do not retain completed logs with an arbitrary TTL and do not add a DB schema.
9. Terminal chunk uses a normal final cursor. After its delivery, the channel ends with `terminal`.
10. SSE reads the same log entries and strips sequence metadata at its existing wire boundary.
11. Backpressure is not a cursor source. Dropped delivery reconnects from the last client-accepted
    run cursor.
12. Only the current WebSocket generation may change global socket state, resolve/reject the current
    connect promise, handle frames, arm/clear watchdogs, or schedule reconnect.

### Breaking protocol shape

Do not add a compatibility shim for `afterChunkSeq` or transport `seq`. Update all current callers
atomically. Use a discriminated run resume token and explicit run frame cursor, for example:

```ts
type RunChunkResumeToken = {
  runId: string
  cursor: number
}

type RunChunksSubFrame = {
  op: 'sub'
  subId: string
  channel: 'run-chunks'
  sessionId: string
  after?: RunChunkResumeToken
}

type RunChunkFrame = {
  subId: string
  kind: 'chunk'
  runId: string
  cursor: number
  chunk: UIMessageChunk
  terminal: boolean
  replay: boolean
}

type RunChunkAckFrame = {
  subId: string
  kind: 'sub-ack'
  channel: 'run-chunks'
  runId: string
  cursor: number
}
```

Other channels retain their domain cursors (`sequenceId`, `version`). Prefer discriminated ack
variants over optional `runId` fields that allow invalid combinations. Remove `seq` from all
`SyncServerDataFrame` variants and from `createBoundedSender`.

### End-reason policy

The run adapter/client state machine must be exhaustive:

| Reason | Meaning | Client action |
| --- | --- | --- |
| `terminal` | Terminal chunk was delivered | Close stream successfully |
| `backpressure` | Delivery path dropped pending data | Keep consumer open; resubscribe from last `{ runId, cursor }` with bounded reconnect backoff |
| `upstream-closed` | Unexpected live source interruption | Keep consumer open; reconnect/resubscribe from last token |
| `snapshot-required` | Exact replay is impossible | Error the stream with a stable typed/code-bearing recovery error so existing Session snapshot hydration can converge; never report normal EOF |
| `not-found` | Session/run cannot be resolved for a fresh subscription | Error the stream; do not retry forever |
| `error` | Protocol/server failure | Error the stream with server detail |

If current stream consumption cannot distinguish the stable snapshot-recovery error and therefore
cannot refresh the Session/message projection, extend the smallest existing chat transport/session
recovery seam. Do not create a second cache authority; Plan 040's React Query + renderer projection
remains authoritative. This plan does not depend on unfinished Plan 050.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused Web tests | `pnpm --filter @cradle/web exec vitest run src/lib/sync-socket/client.test.ts src/lib/sync-socket/adapters/chunk-stream.test.ts` | all tests pass |
| Focused Server tests | `pnpm --filter @cradle/server exec vitest run tests/sync-websocket.test.ts src/modules/sync-gateway/protocol.test.ts src/modules/chat-runtime/stream/run-chunk-log.test.ts --maxWorkers=1` | all tests pass |
| Web typecheck | `pnpm --filter @cradle/web typecheck` | exit 0, API-boundary check included |
| Server typecheck | `pnpm --filter @cradle/server typecheck` | exit 0, module-boundary check included |
| Web suite | `pnpm --filter @cradle/web test` | all tests pass |
| Server suite | `pnpm --filter @cradle/server test` | all tests pass, or only documented pre-existing failures reproduce unchanged |
| Root suite | `pnpm test` | all projects pass, or only documented pre-existing failures reproduce unchanged |
| Scoped lint | `pnpm exec eslint packages/chat-runtime-contracts/src/sync-protocol.ts apps/server/src/modules/sync-gateway apps/server/src/modules/chat-runtime/run-registry.ts apps/server/src/modules/chat-runtime/run apps/server/src/modules/chat-runtime/stream apps/server/tests/sync-websocket.test.ts apps/web/src/lib/sync-socket apps/web/src/features/chat/transport/chat-stream-transport.ts` | exit 0 for touched files |
| Diff hygiene | `git diff --check` | no output |

Repository-wide `pnpm lint` has historical debt. Scoped lint is the blocking gate for this plan;
record any unchanged full-repo baseline failure rather than editing unrelated files.

## Suggested executor toolkit

- Use the `ai-sdk` skill if available when verifying that replay/live `UIMessageChunk` ordering and
  snapshot recovery preserve AI SDK stream semantics.
- Read `apps/server/src/modules/chat-runtime/README.md` and
  `apps/server/specs/capabilities/chat-runtime.md` before changing ownership docs.
- Use `apps/server/tests/sync-websocket.test.ts` and
  `apps/web/src/lib/sync-socket/client.test.ts` as the existing integration/fake-WebSocket patterns.

## Scope

**In scope** (the only source areas that may be modified):

- `packages/chat-runtime-contracts/src/sync-protocol.ts`
- `apps/server/src/modules/sync-gateway/buffer.ts`
- `apps/server/src/modules/sync-gateway/channels.ts`
- `apps/server/src/modules/sync-gateway/connection.ts`
- `apps/server/src/modules/sync-gateway/protocol.ts`
- focused tests beside the sync-gateway modules
- `apps/server/src/modules/chat-runtime/stream/run-chunk-log.ts` (create) and focused test (create)
- `apps/server/src/modules/chat-runtime/stream/session-run-chunk-sync.ts`
- `apps/server/src/modules/chat-runtime/stream/active-run-stream.ts`
- `apps/server/src/modules/chat-runtime/stream/live-run-streams.ts`
- `apps/server/src/modules/chat-runtime/stream/subscriber-registry.ts` only if a generic typed registry
  is necessary; do not force provider-thread consumers into run cursor semantics
- `apps/server/src/modules/chat-runtime/run-registry.ts`
- `apps/server/src/modules/chat-runtime/run/run-coordinator.ts`
- `apps/server/src/modules/chat-runtime/run/provider-synthetic-turn.ts`
- `apps/server/src/modules/chat-runtime/run/active-run-release.ts` only for log/subscriber cleanup
- `apps/server/tests/sync-websocket.test.ts`
- `apps/server/src/modules/chat-runtime/README.md`
- `apps/server/specs/capabilities/chat-runtime.md`
- `apps/web/src/lib/sync-socket/client.ts`
- `apps/web/src/lib/sync-socket/client.test.ts`
- `apps/web/src/lib/sync-socket/adapters/chunk-stream.ts` and a focused adapter test (create if absent)
- `apps/web/src/lib/sync-socket/adapters/session-event-source.ts` and
  `global-event-source.ts` only for the shared client cursor API/type migration
- the smallest existing file under `apps/web/src/features/chat/transport/` or Session stream owner
  required to route `snapshot-required` into canonical snapshot recovery
- `apps/web/src/features/chat/README.md`

**Out of scope**:

- Desktop IPC chat stream transport; the reported surface is Web, not Desktop
- Provider-specific runtime/SDK stream protocols
- Event Sourcing facts, projectors, queue/completion policy, or Plan 044 lifecycle refactor
- DB schema, migrations, or durable raw-chunk storage
- React rendering, scroll/follow behavior, message bubble layout, or UI redesign
- Workspace file channel implementation
- Session cache ownership consolidation from Plan 050
- Retaining completed run logs via arbitrary time/count heuristics
- A fallback that keeps `afterChunkSeq`, accepts both protocol shapes, or guesses cursor offsets

## Git workflow

- Branch: `advisor/054-resumable-websocket-run-stream`
- Suggested logical commits:
  1. `test(sync): characterize run stream interruption`
  2. `refactor(chat-runtime): own run chunk cursors`
  3. `fix(sync): detect and resume interrupted sockets`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: 建立会失败的 characterization net

先新增测试，不先改 production behavior。覆盖：

1. Web fake socket 在 open 时每个 subscription 只发送一次初始 `sub`。
2. 收到匹配 pong 时 socket 保持 open；超过 pong deadline 时当前 socket 被 close，并触发
   reconnect/resubscribe。
3. 旧 socket 在新 generation open 后迟到的 `message`/`close` 不影响新 socket。
4. Run subscription 断线后发送的 resume token 是最后收到的 `{ runId, cursor }`，不是
   sender-local frame position。
5. Server active run 尚无 chunk 时 subscription 保持 live。
6. Replay/live handoff 中插入一个 chunk 时只交付一次，不丢失。
7. Cursor 已被 bounded log 淘汰、resume run 已释放、或 session 当前 runId 已改变时返回
   `snapshot-required`。
8. Tool lifecycle 在 input 后断线、output 前重连时，output 和后续 terminal chunk 均交付。

测试应断言 wire frames 和 observable stream chunks，不锁定 private helper 名称。使用 fake
timers 时显式 restore；每条测试 dispose global sync client，避免跨测试 generation 泄漏。

**Verify**: 运行 focused Web/Server commands。至少 watchdog、empty-active、stable cursor
和 replay handoff 测试应在当前实现上按预期失败；记录失败断言后再进入 Step 2。

### Step 2: 把 run replay 收敛为 run-owned append-only log

创建 `run-chunk-log.ts`，提供窄 API：创建/append、读取或原子 replay+subscribe、读取 latest
cursor、cleanup。把 cap/first-retained-cursor 封装在模块内部。不要向 caller 暴露 mutable
entries 数组、coalesce map 或数组下标。

将 `ActiveRun` 的 `chunkBuffer`、`chunkBufferIndexByKey`、
`chunkBufferDroppedCount` 替换为一个 typed log handle；同步更新普通 run 与 provider
synthetic run 两个初始化点。`publishUIMessageChunk` 必须先 append 得到
`SequencedRunChunk`，再向 run subscribers 发布同一 entry。Terminal flag 与 cursor 在此时
固定。

保留 `publishRuntimeChunk` 在 publication 之前的 pending-delta batching；删除 publication
之后会原地修改/移动 entries 的 replay coalescing。Provider-thread stream 保持现状，不要
被迫携带 run cursor。

SSE `openRunEventStream` 从该 log 读取 chunks 并继续输出既有 SSE bytes。若 active log
已经无法提供完整 initial replay，沿用/扩展现有 interrupted/snapshot recovery 语义，但
不得把残缺 suffix 当完整 replay。若实现这一点需要改变公共 SSE wire contract，STOP。

**Verify**: `run-chunk-log.test.ts` 覆盖 monotonic append、terminal、eviction gap、
append-during-subscribe exact-once 与 empty-live；focused Server tests 全部通过。

### Step 3: 让 sync protocol 携带业务 run identity 与 cursor

在 contracts 与 Zod parser 中实施 breaking shape：移除 `seq` 和 `afterChunkSeq`；run sub
携带 optional `{ runId, cursor }` resume token；run chunk 与 run ack 明确携带 `runId`、
`cursor`。让 TypeScript union 排除 “有 cursor 没 runId” 等非法状态。

删除 `createBoundedSender` 的 `nextSeq`/`withSeq`。Sender 只计算 pending frame count/bytes
并保持 backpressure behavior。

重写 `attachRunChunks` 使用 run log API，而不是自增 `nextSeq` 或读取 array index：

- fresh subscription 绑定 session 当前 active run；
- matching resume 从 cursor 后 exact replay，再原子进入 live；
- active empty run保持 open；
- run mismatch、retention gap、released requested run 返回 `snapshot-required`；
- terminal entry 后 ack final cursor 并 `end('terminal')`；
- 没有 active run 的 fresh subscription 使用明确的 `not-found`，不得伪装
  `upstream-closed` normal EOF。

修正 `hasActiveSessionRun` 的 `undefined` 语义；若新 log API 已让该 helper 多余，删除它，
不要保留两套 active 判断。

**Verify**: protocol parser tests 与 server WebSocket integration tests 通过；执行
`rg -n "afterChunkSeq|withSeq|nextSeq|seq\?: number" packages/chat-runtime-contracts/src/sync-protocol.ts apps/server/src/modules/sync-gateway apps/server/src/modules/chat-runtime/stream apps/web/src/lib/sync-socket`
应无旧 transport cursor 命中（与其他无关 domain sequence 命中需逐条说明）。

### Step 4: 建立 socket generation 与 pong watchdog

重构 `client.ts` 的 connection lifecycle，使每次 `openSocket` 获得单调 generation 或
等价 token。所有 open/message/error/close callbacks、ping/pong timers、connect promise
settlement 都必须同时核对 socket identity 与 generation。旧 generation 事件只清理它自己
持有的 resources，不得写当前全局 state。

在 open 后立即发送带唯一 timestamp/nonce 的 ping，并周期性继续。每个 outstanding ping
arm 一个短于下次 ping interval 的 pong deadline；只有匹配 pong 才确认 liveness。Deadline
到期时 close 当前 generation，让现有 exponential backoff reconnect。Dispose、idle close、
intentional close 必须清除 interval 与 deadline。

选择一个明确常量，例如 `PONG_TIMEOUT_MS = 10_000`，不要用网络质量猜测或动态 heuristic。
它是 failure-detection policy，测试必须使用 fake timers 固定。不要因任意业务 frame 到达就
伪造 pong；业务 frame可作为 activity observability，但协议 heartbeat 必须闭环。

修复首次重复 subscription：选择一个 owner 发送初始/resub frames。推荐 open handler 的
`resubscribeAll()` 为唯一 owner；`subscribeSyncChannel().then(...)` 只在 subscription 是在
已经-open generation 上新增且尚未由该 generation 发送时发送。用 generation-aware
`lastSentGeneration` 消除竞态，不用延时或 boolean 猜测。

**Verify**: focused Web tests 中 watchdog、matching pong、stale close、single initial sub、
dispose cleanup 全部使用 fake timers 稳定通过。

### Step 5: 将 run adapter 改为可恢复状态机

`ActiveSyncSubscription` 不再用一个 scalar `cursor` 表示所有 channel。使用按 channel
discriminated state：session tail 保存 version、global tail 保存 sequenceId、run chunks 保存
optional `{ runId, cursor }`。不要新增 `unknown` + inline guards 绕过 contract types。

收到 run chunk 时先 enqueue，再原子更新该 frame 自带的 resume token；ack 只接受同一
runId 的 monotonic cursor。重复 cursor 应 dedupe；cursor 倒退或同 subscription 上 runId
无协议允许地改变应作为 protocol error，而不是覆盖本地 token。

实现上表的 end-reason policy。关键点：client core 不得在把 frame 交给 channel adapter 前
对所有 `end` 一律 `active.ended = true`。Retryable end 由同一 subscription state 通过
bounded exponential backoff 重新 `sub`，或关闭当前 socket 走统一 reconnect；两者选一个
并测试，不得同时产生重复 subscribe。`snapshot-required` 走稳定 recovery error，
`terminal` 才是成功 EOF。

清理 abort listener、retry timer 和 subscription map。ReadableStream cancel 后的迟到 frame
不得 enqueue/error controller。

**Verify**: adapter tests 覆盖六种 end reason、duplicate/out-of-order cursor、abort during
retry、tool input → disconnect → output → terminal。Focused Web tests 全部通过。

### Step 6: 更新 ownership 文档并跑完整 gates

更新 Chat Runtime README/spec 与 Web Chat README，写明：

- run log/cursor 由 chat-runtime 拥有；
- sync gateway sender 只负责 delivery/backpressure；
- Web heartbeat/reconnect owner 与 end-reason policy；
- exact replay 不可用时由 persisted Session snapshot 恢复；
- SSE 与 WS 共用 run log，但 wire encoding 独立。

依次运行 focused tests、两个 typecheck、scoped lint、Web suite、Server suite、root suite 和
`git diff --check`。若全套仅复现既有失败，在交付说明中给出命令、失败测试名与证明其在
本分支前已存在的基线；不得顺手修改 out-of-scope tests。

**Verify**: 所有 blocking gates 通过；`git status --short` 只包含 Scope 中允许的文件和
`plans/README.md` status 更新。

## Test plan

### `apps/server/src/modules/chat-runtime/stream/run-chunk-log.test.ts`

- cursor strictly increases from first append through terminal;
- live delivery and replay expose identical entry identities;
- runtime-published entries are never mutated after publication;
- front eviction returns `snapshot-required` for an old cursor;
- replay cursor at retained boundary returns exactly the missing suffix;
- append during replay-to-live handoff is delivered exactly once;
- empty active log remains live;
- terminal entry makes replay non-live.

### `apps/server/tests/sync-websocket.test.ts`

- fresh run subscription receives ack with runId/cursor then live chunks;
- empty active run does not emit `upstream-closed`;
- disconnect after tool input and reconnect before tool output resumes exactly once;
- resumed cursor never skips output/terminal;
- wrong/released runId and evicted cursor produce `snapshot-required`;
- terminal chunk cursor is acknowledged before terminal end;
- ping still receives matching pong.

### `apps/web/src/lib/sync-socket/client.test.ts`

- one initial sub per subscription/generation;
- matching pong cancels deadline;
- missing pong closes current socket and reconnects;
- stale generation message/close cannot replace or close current socket;
- reconnect uses latest per-channel domain cursor;
- dispose/idle close clear all heartbeat and retry timers.

### `apps/web/src/lib/sync-socket/adapters/chunk-stream.test.ts`

- run cursor comes only from `{ runId, cursor }` frame fields;
- duplicate frame is ignored and out-of-order frame fails visibly;
- `terminal` closes successfully;
- `backpressure` and `upstream-closed` recover without closing the consumer;
- `snapshot-required`, `not-found`, and `error` do not become normal EOF;
- abort during retry prevents later controller writes;
- tool input/output/terminal ordering survives a reconnect.

Do not add browser/component tests. These state machines and protocol boundaries are deterministic
unit/integration paths and do not require UI automation.

## Done criteria

- [ ] `run-chunks` wire frames and resume requests carry an inseparable `{ runId, cursor }` identity.
- [ ] `rg -n "afterChunkSeq|withSeq|seq\?: number" packages/chat-runtime-contracts/src/sync-protocol.ts apps/server/src/modules/sync-gateway apps/web/src/lib/sync-socket` returns no old transport cursor implementation.
- [ ] Every observable run chunk has a stable append-only cursor; mutable buffer indices are gone from resume logic.
- [ ] Active zero-chunk runs remain subscribed.
- [ ] Replay retention gaps and released/mismatched runs produce `snapshot-required`, never silent EOF.
- [ ] Missing pong closes only the current socket generation and triggers reconnect.
- [ ] A fresh socket sends exactly one `sub` per active subscription.
- [ ] Retryable end reasons keep the consumer recoverable; only `terminal` is successful completion.
- [ ] Focused Web and Server test commands pass.
- [ ] Web and Server typechecks pass.
- [ ] Scoped lint and `git diff --check` pass.
- [ ] Full Web/Server/root tests pass or unchanged pre-existing failures are documented with evidence.
- [ ] No DB migration, Desktop transport change, UI/scroll change, or compatibility shim is present.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back; do not improvise if:

- Current source no longer uses multiplex `/sync` for non-Desktop Chat Session subscriptions, or the
  current protocol already has a different run-owned cursor contract.
- Implementing stable replay appears to require persisting raw chunks or changing DB schema. Use the
  specified `snapshot-required` boundary instead; if that cannot satisfy the consumer, report why.
- SSE cannot consume the new run log without a public wire-format change. Do not silently break SSE.
- Exact replay would require mutating or reusing a cursor already observed by a live client.
- Snapshot recovery would require introducing a second Session/message cache authority or landing
  unfinished Plan 050 first. Report the missing existing recovery seam.
- The fix requires changing Desktop IPC chat streaming or provider SDK protocols.
- Fake-timer watchdog tests cannot be made deterministic without production-only timing branches.
- Any step's focused verification fails twice after a reasonable scoped correction.
- A required change falls outside Scope; list the file and dependency before expanding scope.

## Maintenance notes

- Plan 014 is DONE and covered malformed frames/legacy EventSource catch-up. Plan 054 owns the newer
  multiplex WS liveness and run cursor semantics; do not merge their scopes retroactively.
- Plan 044 may later centralize terminal completion ordering. Its reviewer must preserve the rule that
  terminal publication appends one final run-log cursor only after the chosen completion barrier.
- Plan 050 may later centralize Session projection recovery. It should consume the stable
  `snapshot-required` signal rather than changing run replay semantics.
- Cursor values are process-local active-run delivery positions, not durable Event Sourcing versions.
  Their correctness comes from explicit run identity and snapshot fallback, not DB persistence.
- Reviewer focus: replay/live atomicity, stale socket callbacks, exactly-one initial subscription,
  tool lifecycle ordering, and exhaustive end-reason handling. These are the regression-prone seams.
- If a future product requires lossless raw-chunk replay across process restarts, write a separate
  persistence design plan. Do not extend this in-memory active-run log ad hoc.
