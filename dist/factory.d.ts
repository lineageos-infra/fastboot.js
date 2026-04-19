import type { FastbootDevice, ReconnectCallback } from "./fastboot";
import { type FactoryProgressCallback } from "./utils/progress";
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