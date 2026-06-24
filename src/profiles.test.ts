import { describe, expect, it, vi } from 'vitest'
import type { FastbootDevice } from './fastboot'
import { FAIRPHONE_LOCK_PROFILE, fairphoneRelockSafety, motorolaLockState } from './profiles'

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

describe('fairphoneRelockSafety', () => {
  it('is unsafe when get_unlock_ability is 0', async () => {
    const device = mockDevice({ commands: { 'flashing get_unlock_ability': '0' } })
    expect(await fairphoneRelockSafety(device)).toMatchObject({ safe: false })
  })

  it('is safe when get_unlock_ability is 1', async () => {
    const device = mockDevice({ commands: { 'flashing get_unlock_ability': '1' } })
    expect(await fairphoneRelockSafety(device)).toEqual({ safe: true })
  })

  it('treats an unsupported (null) reading as safe', async () => {
    const device = mockDevice({ commands: { 'flashing get_unlock_ability': 'unsupported' } })
    expect(await fairphoneRelockSafety(device)).toEqual({ safe: true })
  })

  it('is wired into the Fairphone profile', () => {
    expect(FAIRPHONE_LOCK_PROFILE.requiresCriticalUnlock).toBe(true)
    expect(FAIRPHONE_LOCK_PROFILE.checkRelockSafety).toBe(fairphoneRelockSafety)
  })
})

describe('motorolaLockState', () => {
  it('maps securestate values', async () => {
    expect(
      await motorolaLockState(mockDevice({ variables: { securestate: 'flashing_unlocked' } }))
    ).toBe('unlocked')
    expect(
      await motorolaLockState(mockDevice({ variables: { securestate: 'flashing_locked' } }))
    ).toBe('locked')
    expect(await motorolaLockState(mockDevice({ variables: { securestate: 'oem_locked' } }))).toBe(
      'locked'
    )
    expect(await motorolaLockState(mockDevice({ variables: { securestate: 'weird' } }))).toBe(
      'unknown'
    )
  })
})
