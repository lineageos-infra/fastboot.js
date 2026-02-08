import { FactoryProgressCallback } from "./factory";
export declare enum DebugLevel {
    Silent = 0,
    Debug = 1,
    Verbose = 2
}
export type DebugLogger = (...data: any[]) => void;
export declare function logDebug(...data: any[]): void;
export declare function logVerbose(...data: any[]): void;
/**
 * Change the debug level for the fastboot client:
 *   - 0 = silent
 *   - 1 = debug, recommended for general use
 *   - 2 = verbose, for debugging only
 *
 * @param {number} level - Debug level to use.
 */
export declare function setDebugLevel(level: DebugLevel): void;
/**
 * Change the debug logger function for the fastboot client.
 *
 * @param {DebugLogger} logger - Debug logger function to use.
 */
export declare function setDebugLogger(logger: DebugLogger): void;
/**
 * Reads all of the data in the given blob and returns it as an ArrayBuffer.
 *
 * @param {Blob} blob - Blob with the data to read.
 * @returns {Promise<ArrayBuffer>} ArrayBuffer containing data from the blob.
 * @ignore
 */
export declare function readBlobAsBuffer(blob: Blob): Promise<ArrayBuffer>;
export declare function runWithTimedProgress<T>(onProgress: FactoryProgressCallback, action: string, item: string, duration: number, workPromise: Promise<T>): Promise<void>;
/** Exception class for operations that exceeded their timeout duration. */
export declare class TimeoutError extends Error {
    timeout: number;
    constructor(timeout: number);
}
export declare function runWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T>;
//# sourceMappingURL=common.d.ts.map