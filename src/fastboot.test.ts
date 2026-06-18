import { describe, expect, it, vi } from 'vitest'
import { FastbootDevice } from './fastboot'

/**
 * Fake WebUSB device that replays a queue of 64-byte fastboot response packets
 * (each a 4-char status + message) and records what was written out.
 */
function fakeUsb(responses: string[]) {
  const queue = [...responses]
  const sentCommands: string[] = []
  const device = {
    transferIn: vi.fn(async () => {
      const next = queue.shift()
      if (next === undefined) {
        throw new Error('no more canned responses')
      }
      return { data: new TextEncoder().encode(next) }
    }),
    transferOut: vi.fn(async (_ep: number, data: BufferSource) => {
      sentCommands.push(new TextDecoder().decode(data as Uint8Array))
      return { status: 'ok' }
    })
  }
  return { device, sentCommands }
}

function connectedDevice(responses: string[]) {
  const { device, sentCommands } = fakeUsb(responses)
  const fb = new FastbootDevice()
  fb.device = device as unknown as USBDevice
  fb.epIn = 1
  fb.epOut = 1
  return { fb, device, sentCommands }
}

describe('runCommand', () => {
  it('sends the command and returns OKAY text', async () => {
    const { fb, sentCommands } = connectedDevice(['OKAYall good'])
    const resp = await fb.runCommand('getvar:product')
    expect(resp.text).toBe('all good')
    expect(sentCommands).toEqual(['getvar:product'])
  })

  it('rejects commands longer than 64 bytes', async () => {
    const { fb } = connectedDevice([])
    await expect(fb.runCommand('x'.repeat(65))).rejects.toBeInstanceOf(RangeError)
  })

  it('accumulates INFO lines before the terminating OKAY', async () => {
    const { fb } = connectedDevice(['INFOstep one', 'INFOstep two', 'OKAYdone'])
    const resp = await fb.runCommand('boot')
    expect(resp.text).toBe('step one\nstep two\ndone')
  })

  it('captures DATA size without ending text', async () => {
    const { fb } = connectedDevice(['DATA00001000'])
    const resp = await fb.runCommand('download:00001000')
    expect(resp.dataSize).toBe('00001000')
    expect(resp.text).toBe('')
  })

  it('throws FastbootError on a FAIL response', async () => {
    const { fb } = connectedDevice(['FAILunknown command'])
    await expect(fb.runCommand('bogus')).rejects.toMatchObject({
      name: 'FastbootError',
      status: 'FAIL',
      bootloaderMessage: 'unknown command'
    })
  })
})

describe('getVariable', () => {
  it('trims surrounding whitespace from the value', async () => {
    const { fb, sentCommands } = connectedDevice(['OKAY  raven  '])
    expect(await fb.getVariable('product')).toBe('raven')
    expect(sentCommands).toEqual(['getvar:product'])
  })

  it('returns null for an empty response', async () => {
    const { fb } = connectedDevice(['OKAY'])
    expect(await fb.getVariable('nonexistent')).toBeNull()
  })

  it('normalizes a FAIL response to null', async () => {
    const { fb } = connectedDevice(['FAILno such variable'])
    expect(await fb.getVariable('nonexistent')).toBeNull()
  })

  it('rethrows non-FastbootError failures', async () => {
    const { fb, device } = connectedDevice([])
    device.transferOut.mockRejectedValueOnce(new Error('usb stall'))
    await expect(fb.getVariable('product')).rejects.toThrow('usb stall')
  })
})

describe('isConnected', () => {
  it('is false before a device is attached', () => {
    expect(new FastbootDevice().isConnected).toBe(false)
  })

  it('reflects the underlying device/interface state', () => {
    const fb = new FastbootDevice()
    fb.device = {
      opened: true,
      configurations: [{ interfaces: [{ claimed: true }] }]
    } as unknown as USBDevice
    expect(fb.isConnected).toBe(true)
  })
})
