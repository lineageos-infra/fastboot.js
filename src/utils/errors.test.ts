import { describe, expect, it } from 'vitest'
import { FastbootError, ImageError, LpError, TimeoutError, UsbError } from './errors'

describe('FastbootError', () => {
  it('formats the message and exposes status/bootloaderMessage', () => {
    const err = new FastbootError('FAIL', 'unknown command')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('FastbootError')
    expect(err.status).toBe('FAIL')
    expect(err.bootloaderMessage).toBe('unknown command')
    expect(err.message).toBe('Bootloader replied with FAIL: unknown command')
  })
})

describe('TimeoutError', () => {
  it('records the timeout and formats the message', () => {
    const err = new TimeoutError(1500)
    expect(err.name).toBe('TimeoutError')
    expect(err.timeout).toBe(1500)
    expect(err.message).toBe('Timeout of 1500 ms exceeded')
  })
})

describe.each([
  ['ImageError', ImageError],
  ['LpError', LpError],
  ['UsbError', UsbError]
])('%s', (name, Ctor) => {
  it('is an Error with the right name and message', () => {
    const err = new Ctor('boom')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe(name)
    expect(err.message).toBe('boom')
  })
})
