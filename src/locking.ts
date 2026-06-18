import type { FastbootDevice, ReconnectCallback } from './fastboot'
import { FastbootError, RollbackError } from './utils/errors'

export type LockState = 'locked' | 'unlocked' | 'unknown'

/** Whether an operation is safe from bricking the device (e.g. an ARB relock/downgrade). */
export interface SafetyVerdict {
  safe: boolean
  reason?: string
}

/**
 * Optional per-OEM overrides. The library is generic by default; consumers
 * inject device quirks here instead of the library hardcoding model lists.
 */
export interface DeviceLockProfile {
  /** Read lock state for bootloaders not using the standard `unlocked` var (e.g. Motorola `securestate`). */
  getLockState?: (device: FastbootDevice) => Promise<LockState>

  /** Whether unlocking also requires `flashing unlock_critical`. */
  requiresCriticalUnlock?: boolean

  /**
   * Anti-rollback gate consulted before re-locking; `{ safe: false }` blocks the
   * relock. A function, not a flag, because only some OEMs expose a pre-lock signal.
   */
  checkRelockSafety?: (device: FastbootDevice) => Promise<SafetyVerdict>
}

/** Whether the device is running userspace fastboot (fastbootd). */
export async function isUserspace(device: FastbootDevice): Promise<boolean> {
  return (await device.getVariable('is-userspace')) === 'yes'
}

/**
 * Query `flashing get_unlock_ability`. In standard AOSP this reflects the "OEM
 * unlocking" toggle (1 = permitted); some bootloaders (notably Fairphone)
 * overload it to report anti-rollback state. Null when unsupported.
 */
export async function getUnlockAbility(device: FastbootDevice): Promise<boolean | null> {
  let resp
  try {
    resp = (await device.runCommand('flashing get_unlock_ability')).text
  } catch (error) {
    if (error instanceof FastbootError && error.status === 'FAIL') {
      return null
    }
    throw error
  }

  const match = resp.match(/get_unlock_ability:\s*([01])/)
  if (match) {
    return match[1] === '1'
  }

  // Some bootloaders reply with just the bare value.
  const trimmed = resp.trim()
  if (trimmed === '0' || trimmed === '1') {
    return trimmed === '1'
  }
  return null
}

/**
 * Read the bootloader version string, e.g. `slider-1.2-8739948` on Pixel. The
 * value format and any downgrade/anti-rollback policy are OEM-specific, so they
 * live in the consumer, not here.
 */
export async function getBootloaderVersion(device: FastbootDevice): Promise<string | null> {
  return device.getVariable('version-bootloader')
}

/**
 * Whether "critical" partitions are unlocked, parsed from `oem device-info`.
 * Null when the command is unsupported or the field is absent.
 */
export async function getCriticalUnlocked(device: FastbootDevice): Promise<boolean | null> {
  let resp
  try {
    resp = (await device.runCommand('oem device-info')).text
  } catch (error) {
    if (error instanceof FastbootError && error.status === 'FAIL') {
      return null
    }
    throw error
  }

  const match = resp.match(/Device critical unlocked:\s*(true|false)/i)
  if (match) {
    return match[1].toLowerCase() === 'true'
  }
  return null
}

/** Read lock state via a profile override if provided, else the standard `unlocked` var. */
export async function getLockState(
  device: FastbootDevice,
  profile?: DeviceLockProfile
): Promise<LockState> {
  if (profile?.getLockState) {
    return profile.getLockState(device)
  }
  const unlocked = await device.getVariable('unlocked')
  if (unlocked === 'yes') {
    return 'unlocked'
  } else if (unlocked === 'no') {
    return 'locked'
  }
  return 'unknown'
}

/**
 * Unlock the bootloader (`flashing unlock`, plus `unlock_critical` when the
 * profile requires it). Some devices re-enumerate over USB — set `wait` (with an
 * `onReconnect` callback on Android) to ride out the reconnection before
 * verifying. Throws if the device is left locked.
 */
export async function unlockBootloader(
  device: FastbootDevice,
  opts: { profile?: DeviceLockProfile; wait?: boolean; onReconnect?: ReconnectCallback } = {}
): Promise<void> {
  await device.runCommand('flashing unlock')
  if (opts.profile?.requiresCriticalUnlock) {
    await device.runCommand('flashing unlock_critical')
  }

  if (opts.wait) {
    await device.waitForConnect(opts.onReconnect)
  }

  if ((await getLockState(device, opts.profile)) === 'locked') {
    throw new FastbootError('FAIL', 'Bootloader is still locked after unlock')
  }
}

/**
 * Re-lock the bootloader. When the profile supplies a `checkRelockSafety` hook,
 * an unsafe verdict throws {@link RollbackError} and no lock command is sent
 * (unless `allowRollback` is set). See {@link unlockBootloader} for `wait`.
 */
export async function lockBootloader(
  device: FastbootDevice,
  opts: {
    allowRollback?: boolean
    profile?: DeviceLockProfile
    wait?: boolean
    onReconnect?: ReconnectCallback
  } = {}
): Promise<void> {
  if (opts.profile?.checkRelockSafety && !opts.allowRollback) {
    const safety = await opts.profile.checkRelockSafety(device)
    if (!safety.safe) {
      throw new RollbackError(
        safety.reason ??
          'Re-locking the bootloader would brick this device (anti-rollback). ' +
            'Pass allowRollback to override.'
      )
    }
  }

  await device.runCommand('flashing lock')

  if (opts.wait) {
    await device.waitForConnect(opts.onReconnect)
  }

  if ((await getLockState(device, opts.profile)) === 'unlocked') {
    throw new FastbootError('FAIL', 'Bootloader is still unlocked after lock')
  }
}
