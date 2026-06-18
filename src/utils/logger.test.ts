import { afterEach, describe, expect, it, vi } from 'vitest'
import { DebugLevel, logDebug, logVerbose, setDebugLevel, setDebugLogger } from './logger'

afterEach(() => {
  setDebugLevel(DebugLevel.Silent)
  setDebugLogger(console.log)
})

describe('logger', () => {
  it('stays silent at the default level', () => {
    const sink = vi.fn()
    setDebugLogger(sink)
    logDebug('debug')
    logVerbose('verbose')
    expect(sink).not.toHaveBeenCalled()
  })

  it('emits debug but not verbose at level Debug', () => {
    const sink = vi.fn()
    setDebugLogger(sink)
    setDebugLevel(DebugLevel.Debug)
    logDebug('debug')
    logVerbose('verbose')
    expect(sink).toHaveBeenCalledExactlyOnceWith('debug')
  })

  it('emits both debug and verbose at level Verbose', () => {
    const sink = vi.fn()
    setDebugLogger(sink)
    setDebugLevel(DebugLevel.Verbose)
    logDebug('debug', 1)
    logVerbose('verbose', 2)
    expect(sink).toHaveBeenCalledTimes(2)
    expect(sink).toHaveBeenNthCalledWith(1, 'debug', 1)
    expect(sink).toHaveBeenNthCalledWith(2, 'verbose', 2)
  })
})
