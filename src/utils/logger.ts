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
