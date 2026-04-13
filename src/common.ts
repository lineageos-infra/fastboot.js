import { TimeoutError } from "./errors";
import { FactoryProgressCallback } from "./factory";

export enum DebugLevel {
    Silent = 0,
    Debug,
    Verbose,
}

export type DebugLogger = (...data: any[]) => void;

let debugLevel = DebugLevel.Silent;
let debugLogger = console.log;

export function logDebug(...data: any[]) {
    if (debugLevel >= 1) {
        debugLogger(...data);
    }
}

export function logVerbose(...data: any[]) {
    if (debugLevel >= 2) {
        debugLogger(...data);
    }
}

/**
 * Change the debug level for the fastboot client:
 *   - 0 = silent
 *   - 1 = debug, recommended for general use
 *   - 2 = verbose, for debugging only
 *
 * @param {number} level - Debug level to use.
 */
export function setDebugLevel(level: DebugLevel) {
    debugLevel = level;
}

/**
 * Change the debug logger function for the fastboot client.
 *
 * @param {DebugLogger} logger - Debug logger function to use.
 */
export function setDebugLogger(logger: DebugLogger) {
    debugLogger = logger;
}

/**
 * Reads all of the data in the given blob and returns it as an ArrayBuffer.
 *
 * @param {Blob} blob - Blob with the data to read.
 * @returns {Promise<ArrayBuffer>} ArrayBuffer containing data from the blob.
 * @ignore
 */
export function readBlobAsBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result! as ArrayBuffer);
        };
        reader.onerror = () => {
            reject(reader.error);
        };

        reader.readAsArrayBuffer(blob);
    });
}

function waitForFrame() {
    return new Promise((resolve, _reject) => {
        window.requestAnimationFrame(resolve);
    });
}

export async function runWithTimedProgress<T>(
    onProgress: FactoryProgressCallback,
    action: string,
    item: string,
    duration: number,
    workPromise: Promise<T>
) {
    let startTime = new Date().getTime();
    let stop = false;

    onProgress(action, item, 0.0);
    let progressPromise = (async () => {
        let now;
        let targetTime = startTime + duration;

        do {
            now = new Date().getTime();
            onProgress(action, item, (now - startTime) / duration);
            await waitForFrame();
        } while (!stop && now < targetTime);
    })();

    await Promise.race([progressPromise, workPromise]);
    stop = true;
    await progressPromise;
    await workPromise;

    onProgress(action, item, 1.0);
}

export function runWithTimeout<T>(
    promise: Promise<T>,
    timeout: number
): Promise<T> {
    return new Promise((resolve, reject) => {
        // Set up timeout
        let timedOut = false;
        let tid = setTimeout(() => {
            // Set sentinel first to prevent race in promise resolving
            timedOut = true;
            reject(new TimeoutError(timeout));
        }, timeout);

        // Passthrough
        promise
            .then((val) => {
                if (!timedOut) {
                    resolve(val);
                }
            })
            .catch((err) => {
                if (!timedOut) {
                    reject(err);
                }
            })
            .finally(() => {
                if (!timedOut) {
                    clearTimeout(tid);
                }
            });
    });
}
