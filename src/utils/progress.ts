import { TimeoutError } from "./errors";

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
export type FactoryProgressCallback = (
    action: string,
    item: string,
    progress: number,
) => void;

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
    workPromise: Promise<T>,
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
    timeout: number,
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
