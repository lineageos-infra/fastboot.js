/**
 * Callback for progress updates while flashing or uploading an image.
 *
 * @callback FlashProgressCallback
 * @param {number} progress - Progress for the current action, between 0 and 1.
 */
export type FlashProgressCallback = (progress: number) => void;
/**
 * Callback for factory image flashing progress.
 *
 * @callback FactoryProgressCallback
 * @param {string} action - Action in the flashing process, e.g. unpack/flash.
 * @param {string} item - Item processed by the action, e.g. partition being flashed.
 * @param {number} progress - Progress within the current action between 0 and 1.
 */
export type FactoryProgressCallback = (action: string, item: string, progress: number) => void;
export declare function runWithTimedProgress<T>(onProgress: FactoryProgressCallback, action: string, item: string, duration: number, workPromise: Promise<T>): Promise<void>;
export declare function runWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T>;
//# sourceMappingURL=progress.d.ts.map