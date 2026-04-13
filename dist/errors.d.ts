/**
 * Exception class for errors returned by the bootloader, as well as high-level
 * fastboot errors resulting from bootloader responses.
 */
export declare class FastbootError extends Error {
    status: string;
    bootloaderMessage: string;
    constructor(status: string, message: string);
}
/**
 * Exception class for Sparse Image errors.
 */
export declare class ImageError extends Error {
    constructor(message: string);
}
/**
 * Exception class for logical partition parsing errors.
 */
export declare class LpError extends Error {
    constructor(message: string);
}
/**
 * Exception class for operations that exceeded their timeout duration.
 */
export declare class TimeoutError extends Error {
    timeout: number;
    constructor(timeout: number);
}
/**
 * Exception class for USB errors not directly thrown by WebUSB.
 */
export declare class UsbError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map