# opencode Provider 能力差距分析

> Cradle `OpencodeProvider` 当前实现 vs opencode SDK 原生能力之间的差距。

## 总览

| 类别 | Opencode SDK 能力 | Cradle 实现 | 优先级 |
|------|:-:|:-:|:-:|
| Title 生成 | `small_model` config、`session.summarize()`、`session.get()`、`session.update()` | ✅ 已实现 | 高 |
| Slash Commands | `command` config、`client.command.list()`、`session.command()` | ✅ 已实现列表投影与 `/command` 路由 | 高 |
| Shell 执行 | `session.shell()` | ✅ `supportsShellExecution: true` | 高 |
| 呈现能力 (Presentation) | command/slot 系统 | ✅ 已实现 `getPresentation`/`getDraftPresentation` | 高 |
| UI Slot 状态 | session/model 可读状态，流式事件含 step/agent/compact 等 | ✅ 已实现 status/model 状态；事件继续走 stream evidence | 中 |
| Steer Turn | `session.revert()` / `session.unrevert()` | ⏸ 未声明；Chat Runtime hook 是 live-turn steer，opencode 当前无等价 active-turn API | 中 |
| 回滚 (Rollback) | `session.messages()` + `session.revert()` | ✅ `supportsLastTurnRollback: true` | 中 |
| btw / Quick Question | SDK 无原生 no-history 概念 | ✅ 临时 opencode session + transcript prompt，不写 Cradle 历史 | 中 |
| Skills | v2 `SkillV2Info.slash` | ⏸ 当前 adapter 使用 SDK v1 surface，未读取 v2 skills | 低 |
| Runtime 设置 | SDK 支持 mode/agent 切换 | ❌ `supportsRuntimeSettings: false` | 低 |

## 详细分析

### 1. Title 生成

**SDK 可用资源**:
- Config: `small_model` — 专门为 title 等轻量任务指定模型
- Config (v2): `agent.title` — 专用于 title 生成的 agent 配置
- API: `session.summarize({ providerID, modelID })` — POST `/session/{id}/summarize`
- API: `session.update({ title })` — PATCH `/session/{id}` 直接设置标题

**Cradle 接口**: `ChatRuntime.generateSessionTitle(input: GenerateSessionTitleInput): Promise<string | null>`

**当前实现**: 利用 `small_model` 或主模型调用 `session.summarize()`。在 `@opencode-ai/sdk@1.17.11` 中 `session.summarize()` 返回 `boolean`，标题需要再通过 `session.get()` 读取；adapter 会将非空标题通过 Chat Runtime title hook 返回。

### 2. Slash Commands

**SDK 可用资源**:
- Config 字段 `command`:
  ```ts
  command?: {
    [key: string]: {
      template: string
      description?: string
      agent?: string
      model?: string
      subtask?: boolean
      variant?: string  // v2 only
    }
  }
  ```
- API: `client.command.list()` — GET `/command` — 列出所有可用命令
- API: `session.command({ body: { command, text? } })` — POST `/session/{id}/command` — 执行命令
- SDK `Command` 类型:
  ```ts
  type Command = {
    name: string
    description?: string
    agent?: string
    model?: string
    source?: "command" | "mcp" | "skill"
    template: string
    subtask?: boolean
    hints: Array<string>
  }
  ```

**Cradle 接口**: 
- `getPresentation(input) → RuntimePresentationCapabilities` (含 `slashCommands: RuntimeSlashCommand[]`)
- `getDraftPresentation() → RuntimePresentationCapabilities`

**当前实现**: 
1. 通过 live SDK server 的 `client.command.list()` 读取命令列表
2. 映射为 `RuntimeSlashCommand[]` 通过 `getPresentation` 暴露
3. `streamTurn` 识别已注册 `/command` 文本并路由到 `session.command()`；未匹配的文本继续走 `session.prompt()`

### 3. btw / Quick Question

**概念**: Cradle 的 "btw" 是一种不记入历史记录的快速提问模式，在 Claude Agent 中实现为 `RuntimeUiSlot`:
```ts
{ name: 'btw', commandText: '/btw ', surfaces: ['slashCommand', 'composerState'] }
```

**SDK 对应**: opencode SDK **没有**直接对应的概念。当前实现创建临时 opencode session，用 Cradle transcript 构造轻量 prompt，完成后删除临时 session。

**Cradle 接口**: `ChatRuntime.quickQuestion?()`

### 4. Shell 执行

**SDK 可用资源**:
- API: `session.shell({ body: { command } })` — POST `/session/{id}/shell`

**Cradle 接口**: `ChatRuntime.executeShellCommand?(input): Promise<ExecuteShellCommandResult>`

**当前状态**: `supportsShellExecution: true`，`executeShellCommand` 调用 `session.shell()`，再读取对应 message parts 投影 stdout/stderr。

### 5. 呈现能力 (Presentation)

**SDK 可用资源**:
- `client.command.list()` — 获取可用命令
- opencode 的事件流含 step/agent 状态信息

**Cradle 接口**:
- `getPresentation(input: GetCapabilitiesInput): Promise<RuntimePresentationCapabilities>`
- `getDraftPresentation(): Promise<RuntimePresentationCapabilities> | RuntimePresentationCapabilities`

`RuntimePresentationCapabilities`:
```ts
{
  runtimeKind: RuntimeKind
  slashCommands: RuntimeSlashCommand[]
  uiSlots: RuntimeUiSlot[]
  skills: string[]
}
```

**当前状态**: 已实现。`getDraftPresentation()` 返回静态 slot；`getPresentation()` 额外读取 opencode command list。

### 6. UI Slot 状态

**SDK 可用资源**: 事件流中的 `agent`、`subtask`、`step-start`、`step-finish`、`compaction` 等事件。

**Cradle 接口**: `getUiSlotStates?(input): Promise<RuntimeUiSlotState[]>`

**当前状态**: 已实现 status/model 这类可直接读取的状态。step/agent/compact 等 provider 事件仍以 `data-runtime-event` 形式进入 stream evidence，不在 polled slot state 中猜测生命周期。

### 7. Steer Turn / Rollback

**SDK 可用资源**:
- `session.revert()` — POST `/session/{id}/revert`
- `session.unrevert()` — POST `/session/{id}/unrevert`

**Cradle 接口**:
- `steerTurn?(input): Promise<void>`
- `rollbackLastTurn?(input): Promise<RollbackLastTurnResult>`

**当前状态**:
- `rollbackLastTurn()` 已实现：读取最近 assistant message 后调用 `session.revert()`，不回滚工作区文件。
- `steerTurn` 未声明：Cradle 当前 hook 面向 active turn live steering，opencode v1 SDK 暴露的是 session revert/unrevert primitive，不具备同等语义。

## 参考实现

### Claude Agent Provider

| 方法 | 文件 |
|------|------|
| `generateSessionTitle` | `provider.ts:1015-1050` |
| `getPresentation` | `provider.ts:258-277` |
| `getUiSlotStates` | `provider.ts:279-303` |
| btw slot 定义 | `metadata.ts:39-102` |
| slash commands 映射 | `metadata.ts:104-118` |

### Codex Provider

| 方法 | 文件 |
|------|------|
| `generateSessionTitle` | `provider.ts:1780-1819` |
| `getPresentation` / `getDraftPresentation` | `provider.ts:544-550` |
| `getUiSlotStates` | `provider.ts:584+` |
| UI slot 定义 | `projection/ui-slot-projector.ts` |
