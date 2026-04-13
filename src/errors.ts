/**
 * Exception class for errors returned by the bootloader, as well as high-level
 * fastboot errors resulting from bootloader responses.
 */
export class FastbootError extends Error {
    status: string;
    bootloaderMessage: string;

    constructor(status: string, message: string) {
        super(`Bootloader replied with ${status}: ${message}`);
        this.status = status;
        this.bootloaderMessage = message;
        this.name = "FastbootError";
    }
}

/**
 * Exception class for Sparse Image errors.
 */
export class ImageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ImageError";
    }
}

/**
 * Exception class for operations that exceeded their timeout duration.
 */
export class TimeoutError extends Error {
    timeout: number;

    constructor(timeout: number) {
        super(`Timeout of ${timeout} ms exceeded`);
        this.name = "TimeoutError";
        this.timeout = timeout;
    }
}

/**
 * Exception class for USB errors not directly thrown by WebUSB.
 */
export class UsbError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UsbError";
    }
}
