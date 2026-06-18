import { describe, expect, it, vi } from 'vitest'
import { TimeoutError } from './errors'
import { runWithTimedProgress, runWithTimeout } from './progress'

describe('runWithTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    const result = await runWithTimeout(Promise.resolve('ok'), 100)
    expect(result).toBe('ok')
  })

  it('rejects with TimeoutError when the promise is too slow', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 50))
    await expect(runWithTimeout(slow, 10)).rejects.toBeInstanceOf(TimeoutError)
  })

  it('propagates rejection from the wrapped promise', async () => {
    const failing = Promise.reject(new Error('inner failure'))
    await expect(runWithTimeout(failing, 100)).rejects.toThrow('inner failure')
  })
})

describe('runWithTimedProgress', () => {
  it('reports 0 at the start, 1 at the end, and awaits the work', async () => {
    const onProgress = vi.fn()
    let workDone = false
    const work = new Promise<void>((resolve) =>
      setTimeout(() => {
        workDone = true
        resolve()
      }, 20)
    )

    await runWithTimedProgress(onProgress, 'flash', 'boot', 10, work)

    expect(workDone).toBe(true)
    expect(onProgress).toHaveBeenCalledWith('flash', 'boot', 0.0)
    expect(onProgress).toHaveBeenLastCalledWith('flash', 'boot', 1.0)
    // Every reported value is bounded and tagged with the action/item.
    for (const [action, item, progress] of onProgress.mock.calls) {
      expect(action).toBe('flash')
      expect(item).toBe('boot')
      expect(progress).toBeGreaterThanOrEqual(0)
    }
  })
})
