import type { FastbootDevice, ReconnectCallback } from "./fastboot";
/**
 * Callback for factory image flashing progress.
 *
 * @callback FactoryProgressCallback
 * @param {string} action - Action in the flashing process, e.g. unpack/flash.
 * @param {string} item - Item processed by the action, e.g. partition being flashed.
 * @param {number} progress - Progress within the current action between 0 and 1.
 */
export type FactoryProgressCallback = (action: string, item: string, progress: number) => void;
/**
 * User-friendly action strings for factory image flashing progress.
 * This can be indexed by the action argument in FactoryFlashCallback.
 */
export declare const USER_ACTION_MAP: {
    load: string;
    unpack: string;
    flash: string;
    wipe: string;
    reboot: string;
};
export declare function flashZip(device: FastbootDevice, blob: Blob, wipe: boolean, onReconnect: ReconnectCallback, onProgress?: FactoryProgressCallback): Promise<void>;
//# sourceMappingURL=factory.d.ts.map