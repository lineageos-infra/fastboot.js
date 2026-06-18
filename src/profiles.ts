import type { FastbootDevice } from './fastboot'
import {
  getUnlockAbility,
  type DeviceLockProfile,
  type LockState,
  type SafetyVerdict
} from './locking'

/**
 * Per-OEM building blocks over the generic mechanism in `./locking`. These
 * encode model-specific knowledge and are opt-in: consumers map a detected
 * device to a profile, the core library stays device-agnostic.
 */

/**
 * Fairphone relock guard: the bootloader reports `get_unlock_ability == 0` when
 * re-locking would brick the device. A null (unsupported) reading is safe.
 */
export async function fairphoneRelockSafety(device: FastbootDevice): Promise<SafetyVerdict> {
  const ability = await getUnlockAbility(device)
  if (ability === false) {
    return {
      safe: false,
      reason: 'fastboot flashing get_unlock_ability returned 0; re-locking would brick the device'
    }
  }
  return { safe: true }
}

export const FAIRPHONE_LOCK_PROFILE: DeviceLockProfile = {
  requiresCriticalUnlock: true,
  checkRelockSafety: fairphoneRelockSafety
}

/** Motorola reports lock state via `securestate` rather than the standard `unlocked` var. */
export async function motorolaLockState(device: FastbootDevice): Promise<LockState> {
  const state = await device.getVariable('securestate')
  if (state === 'flashing_unlocked') {
    return 'unlocked'
  } else if (state === 'flashing_locked' || state === 'oem_locked') {
    return 'locked'
  }
  return 'unknown'
}

/**
 * Motorola exposes no queryable anti-rollback signal — its ARB only surfaces as
 * a FAIL during flashing — so there is no `checkRelockSafety` hook.
 */
export const MOTOROLA_LOCK_PROFILE: DeviceLockProfile = {
  getLockState: motorolaLockState
}
