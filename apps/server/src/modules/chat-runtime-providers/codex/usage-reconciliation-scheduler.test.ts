import { afterEach, describe, expect, it, vi } from 'vitest'

import { CodexUsageReconciliationScheduler } from './usage-reconciliation-scheduler'

afterEach(() => {
  vi.useRealTimers()
})

describe('codex usage reconciliation scheduler', () => {
  it('prioritizes the newest 200 pending bindings, then continues in low-priority batches', async () => {
    vi.useFakeTimers()
    const reconcile = vi.fn()
      .mockResolvedValueOnce({ bindings: 200, threads: 0, inserted: 0, duplicates: 0, incidents: 0 })
      .mockResolvedValueOnce({ bindings: 5, threads: 0, inserted: 0, duplicates: 0, incidents: 0 })
      .mockResolvedValueOnce({ bindings: 0, threads: 0, inserted: 0, duplicates: 0, incidents: 0 })
    const scheduler = new CodexUsageReconciliationScheduler(reconcile)

    scheduler.start()
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledWith({ maxBindings: 200 }))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(reconcile).toHaveBeenLastCalledWith({ maxBindings: 5 })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(reconcile).toHaveBeenCalledTimes(3)

    await scheduler.stop()
  })

  it('does not schedule more work after shutdown', async () => {
    vi.useFakeTimers()
    const reconcile = vi.fn().mockResolvedValue({ bindings: 5, threads: 0, inserted: 0, duplicates: 0, incidents: 0 })
    const scheduler = new CodexUsageReconciliationScheduler(reconcile)

    scheduler.start()
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1))
    await scheduler.stop()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(reconcile).toHaveBeenCalledTimes(1)
  })
})
