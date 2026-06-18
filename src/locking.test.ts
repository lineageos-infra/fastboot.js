import { describe, expect, it, vi } from 'vitest'
import type { FastbootDevice } from './fastboot'
import {
  getCriticalUnlocked,
  getLockState,
  getUnlockAbility,
  isUserspace,
  lockBootloader,
  unlockBootloader
} from './locking'
import { FastbootError, RollbackError } from './utils/errors'

/**
 * Minimal stand-in for FastbootDevice. `variables` backs getVariable and
 * `commands` maps a runCommand string to its response text (or a thrower).
 */
function mockDevice(
  opts: {
    variables?: Record<string, string | null>
    commands?: Record<string, string | (() => string)>
  } = {}
) {
  const variables = opts.variables ?? {}
  const commands = opts.commands ?? {}
  return {
    getVariable: vi.fn(async (name: string) => variables[name] ?? null),
    runCommand: vi.fn(async (command: string) => {
      const resp = commands[command]
      if (resp === undefined) {
        return { text: '' }
      }
      return { text: typeof resp === 'function' ? resp() : resp }
    }),
    waitForConnect: vi.fn(async () => {})
  } as unknown as FastbootDevice
}

describe('isUserspace', () => {
  it('is true only when is-userspace reports yes', async () => {
    expect(await isUserspace(mockDevice({ variables: { 'is-userspace': 'yes' } }))).toBe(true)
    expect(await isUserspace(mockDevice({ variables: { 'is-userspace': 'no' } }))).toBe(false)
    expect(await isUserspace(mockDevice())).toBe(false)
  })
})

describe('getUnlockAbility', () => {
  it('parses the labelled form', async () => {
    const device = mockDevice({
      commands: { 'flashing get_unlock_ability': 'get_unlock_ability: 1' }
    })
    expect(await getUnlockAbility(device)).toBe(true)
  })

  it('parses a bare 0/1 value', async () => {
    expect(
      await getUnlockAbility(mockDevice({ commands: { 'flashing get_unlock_ability': '0' } }))
    ).toBe(false)
  })

  it('returns null for an unparseable response', async () => {
    expect(
      await getUnlockAbility(mockDevice({ commands: { 'flashing get_unlock_ability': 'huh' } }))
    ).toBeNull()
  })

  it('returns null when the command FAILs', async () => {
    const device = mockDevice({
      commands: {
        'flashing get_unlock_ability': () => {
          throw new FastbootError('FAIL', 'unknown command')
        }
      }
    })
    expect(await getUnlockAbility(device)).toBeNull()
  })

  it('rethrows non-FAIL errors', async () => {
    const device = mockDevice({
      commands: {
        'flashing get_unlock_ability': () => {
          throw new Error('usb died')
        }
      }
    })
    await expect(getUnlockAbility(device)).rejects.toThrow('usb died')
  })
})

describe('getCriticalUnlocked', () => {
  it('parses the device-info field case-insensitively', async () => {
    const device = mockDevice({
      commands: { 'oem device-info': 'Device critical unlocked: TRUE' }
    })
    expect(await getCriticalUnlocked(device)).toBe(true)
  })

  it('returns null when the field is absent', async () => {
    expect(
      await getCriticalUnlocked(mockDevice({ commands: { 'oem device-info': 'nothing here' } }))
    ).toBeNull()
  })

  it('returns null when the command FAILs', async () => {
    const device = mockDevice({
      commands: {
        'oem device-info': () => {
          throw new FastbootError('FAIL', 'unsupported')
        }
      }
    })
    expect(await getCriticalUnlocked(device)).toBeNull()
  })

  it('rethrows non-FAIL errors', async () => {
    const device = mockDevice({
      commands: {
        'oem device-info': () => {
          throw new Error('usb died')
        }
      }
    })
    await expect(getCriticalUnlocked(device)).rejects.toThrow('usb died')
  })
})

describe('getLockState', () => {
  it('maps the standard unlocked variable', async () => {
    expect(await getLockState(mockDevice({ variables: { unlocked: 'yes' } }))).toBe('unlocked')
    expect(await getLockState(mockDevice({ variables: { unlocked: 'no' } }))).toBe('locked')
    expect(await getLockState(mockDevice())).toBe('unknown')
  })

  it('delegates to a profile override', async () => {
    const getLockStateOverride = vi.fn(async () => 'unlocked' as const)
    const device = mockDevice()
    expect(await getLockState(device, { getLockState: getLockStateOverride })).toBe('unlocked')
    expect(getLockStateOverride).toHaveBeenCalledWith(device)
  })
})

describe('unlockBootloader', () => {
  it('issues flashing unlock and succeeds when the device unlocks', async () => {
    const device = mockDevice({ variables: { unlocked: 'yes' } })
    await unlockBootloader(device)
    expect(device.runCommand).toHaveBeenCalledWith('flashing unlock')
    expect(device.runCommand).not.toHaveBeenCalledWith('flashing unlock_critical')
  })

  it('also unlocks critical when the profile requires it', async () => {
    const device = mockDevice({ variables: { unlocked: 'yes' } })
    await unlockBootloader(device, { profile: { requiresCriticalUnlock: true } })
    expect(device.runCommand).toHaveBeenCalledWith('flashing unlock_critical')
  })

  it('throws if the device is still locked afterward', async () => {
    const device = mockDevice({ variables: { unlocked: 'no' } })
    await expect(unlockBootloader(device)).rejects.toThrow(FastbootError)
  })

  it('waits for reconnect when wait is set', async () => {
    const device = mockDevice({ variables: { unlocked: 'yes' } })
    const onReconnect = vi.fn()
    await unlockBootloader(device, { wait: true, onReconnect })
    expect(device.waitForConnect).toHaveBeenCalledWith(onReconnect)
  })
})

describe('lockBootloader', () => {
  it('issues flashing lock and succeeds when the device locks', async () => {
    const device = mockDevice({ variables: { unlocked: 'no' } })
    await lockBootloader(device)
    expect(device.runCommand).toHaveBeenCalledWith('flashing lock')
  })

  it('throws if the device is still unlocked afterward', async () => {
    const device = mockDevice({ variables: { unlocked: 'yes' } })
    await expect(lockBootloader(device)).rejects.toThrow(FastbootError)
  })

  it('blocks an unsafe relock with RollbackError and sends no lock command', async () => {
    const device = mockDevice({ variables: { unlocked: 'no' } })
    const profile = {
      checkRelockSafety: vi.fn(async () => ({ safe: false, reason: 'rollback' }))
    }
    await expect(lockBootloader(device, { profile })).rejects.toThrow(RollbackError)
    expect(device.runCommand).not.toHaveBeenCalled()
  })

  it('uses a default RollbackError message when the verdict gives no reason', async () => {
    const device = mockDevice({ variables: { unlocked: 'no' } })
    const profile = { checkRelockSafety: vi.fn(async () => ({ safe: false })) }
    await expect(lockBootloader(device, { profile })).rejects.toThrow(/anti-rollback/)
  })

  it('proceeds past an unsafe verdict when allowRollback is set', async () => {
    const device = mockDevice({ variables: { unlocked: 'no' } })
    const profile = {
      checkRelockSafety: vi.fn(async () => ({ safe: false, reason: 'rollback' }))
    }
    await lockBootloader(device, { profile, allowRollback: true })
    expect(device.runCommand).toHaveBeenCalledWith('flashing lock')
  })

  it('waits for reconnect when wait is set', async () => {
    const device = mockDevice({ variables: { unlocked: 'no' } })
    const onReconnect = vi.fn()
    await lockBootloader(device, { wait: true, onReconnect })
    expect(device.waitForConnect).toHaveBeenCalledWith(onReconnect)
  })
})
