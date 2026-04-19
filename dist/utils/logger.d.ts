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
//# sourceMappingURL=logger.d.ts.map