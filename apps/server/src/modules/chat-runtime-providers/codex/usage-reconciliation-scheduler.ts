import type { CodexUsageReconciliationSummary } from './usage-reconciliation'
import { reconcileCradleCodexUsage } from './usage-reconciliation'

const PRIORITY_BINDING_LIMIT = 200
const BACKGROUND_BINDING_LIMIT = 5
const BACKGROUND_DELAY_MS = 5_000

type ReconcileCodexUsage = (input: { maxBindings: number }) => Promise<CodexUsageReconciliationSummary>

export class CodexUsageReconciliationScheduler {
  private activeTask: Promise<void> | null = null
  private scheduledTask: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(
    private readonly reconcile: ReconcileCodexUsage = reconcileCradleCodexUsage,
  ) {}

  start(): void {
    if (this.activeTask || this.scheduledTask || this.stopped) {
      return
    }
    this.run(() => this.runPriorityPass())
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.scheduledTask) {
      clearTimeout(this.scheduledTask)
      this.scheduledTask = null
    }
    await this.activeTask
  }

  private async runPriorityPass(): Promise<void> {
    await this.reconcile({ maxBindings: PRIORITY_BINDING_LIMIT })
    this.scheduleBackgroundPass()
  }

  private scheduleBackgroundPass(): void {
    if (this.stopped || this.scheduledTask) {
      return
    }
    this.scheduledTask = setTimeout(() => {
      this.scheduledTask = null
      this.run(() => this.runBackgroundPass())
    }, BACKGROUND_DELAY_MS)
  }

  private async runBackgroundPass(): Promise<void> {
    const summary = await this.reconcile({ maxBindings: BACKGROUND_BINDING_LIMIT })
    if (summary.bindings > 0) {
      this.scheduleBackgroundPass()
    }
  }

  private run(task: () => Promise<void>): void {
    this.activeTask = task()
      .catch((error) => {
        console.error('[codex-usage-reconciliation] Background reconciliation failed:', error)
      })
      .finally(() => {
        this.activeTask = null
      })
  }
}
