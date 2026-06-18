// @license magnet:?xt=urn:btih:d3d9a9a6595521f9666a5e94cc830dab83b65699&dn=expat.txt MIT

export { FastbootDevice } from './fastboot'
export {
  FastbootError,
  ImageError,
  LpError,
  TimeoutError,
  UsbError,
  RollbackError
} from './utils/errors'
export { USER_ACTION_MAP } from './factory'
export {
  type LockState,
  type SafetyVerdict,
  type DeviceLockProfile,
  isUserspace,
  getUnlockAbility,
  getBootloaderVersion,
  getCriticalUnlocked,
  getLockState,
  unlockBootloader,
  lockBootloader
} from './locking'
export {
  fairphoneRelockSafety,
  FAIRPHONE_LOCK_PROFILE,
  motorolaLockState,
  MOTOROLA_LOCK_PROFILE
} from './profiles'
export { setDebugLevel, setDebugLogger } from './utils/logger'
export {
  type LpMetadata,
  type LpMetadataGeometry,
  type LpMetadataBlockDevice,
  readFromImageBlob,
  getMetadataSuperBlockDevice,
  getBlockDevicePartitionName,
  buildWipeSuperImages
} from './lp'

export { configure as configureZip } from '@zip.js/zip.js'

// @license-end
