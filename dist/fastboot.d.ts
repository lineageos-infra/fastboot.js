/// <reference types="w3c-web-usb" />
import { FactoryProgressCallback } from "./factory";
/**
 * Exception class for USB errors not directly thrown by WebUSB.
 */
export declare class UsbError extends Error {
    constructor(message: string);
}
/**
 * Exception class for errors returned by the bootloader, as well as high-level
 * fastboot errors resulting from bootloader responses.
 */
export declare class FastbootError extends Error {
    status: string;
    bootloaderMessage: string;
    constructor(status: string, message: string);
}
interface CommandResponse {
    text: string;
    dataSize?: string;
}
/**
 * Callback for progress updates while flashing or uploading an image.
 *
 * @callback FlashProgressCallback
 * @param {number} progress - Progress for the current action, between 0 and 1.
 */
export type FlashProgressCallback = (progress: number) => void;
/**
 * Callback for reconnecting to the USB device.
 * This is necessary because some platforms do not support automatic reconnection,
 * and USB connection requests can only be triggered as the result of explicit
 * user action.
 *
 * @callback ReconnectCallback
 */
export type ReconnectCallback = () => void;
/**
 * This class is a client for executing fastboot commands and operations on a
 * device connected over USB.
 */
export declare class FastbootDevice {
    device: USBDevice | null;
    epIn: number | null;
    epOut: number | null;
    private _registeredUsbListeners;
    private _connectResolve;
    private _connectReject;
    private _disconnectResolve;
    /**
     * Create a new fastboot device instance. This doesn't actually connect to
     * any USB devices; call {@link connect} to do so.
     */
    constructor();
    /**
     * Returns whether a USB device is connected and ready for use.
     */
    get isConnected(): boolean;
    /**
     * Validate the current USB device's details and connect to it.
     *
     * @private
     */
    private _validateAndConnectDevice;
    /**
     * Wait for the current USB device to disconnect, if it's still connected.
     * Returns immediately if no device is connected.
     */
    waitForDisconnect(): Promise<unknown>;
    /**
     * Wait for the USB device to connect. Returns at the next connection,
     * regardless of whether the connected USB device matches the previous one.
     *
     * @param {ReconnectCallback} onReconnect - Callback to request device reconnection on Android.
     */
    waitForConnect(onReconnect?: ReconnectCallback): Promise<unknown>;
    /**
     * Request the user to select a USB device and connect to it using the
     * fastboot protocol.
     *
     * @throws {UsbError}
     */
    connect(): Promise<void>;
    /**
     * Read a raw command response from the bootloader.
     *
     * @private
     * @returns {Promise<CommandResponse>} Object containing response text and data size, if any.
     * @throws {FastbootError}
     */
    private _readResponse;
    /**
     * Send a textual command to the bootloader and read the response.
     * This is in raw fastboot format, not AOSP fastboot syntax.
     *
     * @param {string} command - The command to send.
     * @returns {Promise<CommandResponse>} Object containing response text and data size, if any.
     * @throws {FastbootError}
     */
    runCommand(command: string): Promise<CommandResponse>;
    /**
     * Read the value of a bootloader variable. Returns undefined if the variable
     * does not exist.
     *
     * @param {string} varName - The name of the variable to get.
     * @returns {Promise<string>} Textual content of the variable.
     * @throws {FastbootError}
     */
    getVariable(varName: string): Promise<string | null>;
    /**
     * Get the maximum download size for a single payload, in bytes.
     *
     * @private
     * @returns {Promise<number>}
     * @throws {FastbootError}
     */
    private _getDownloadSize;
    /**
     * Send a raw data payload to the bootloader.
     *
     * @private
     */
    private _sendRawPayload;
    /**
     * Upload a payload to the bootloader for later use, e.g. flashing.
     * Does not handle raw images, flashing, or splitting.
     *
     * @param {string} partition - Name of the partition the payload is intended for.
     * @param {ArrayBuffer} buffer - Buffer containing the data to upload.
     * @param {FlashProgressCallback} onProgress - Callback for upload progress updates.
     * @throws {FastbootError}
     */
    upload(partition: string, buffer: ArrayBuffer, onProgress?: FlashProgressCallback): Promise<void>;
    /**
     * Reboot to the given target, and optionally wait for the device to
     * reconnect.
     *
     * @param {string} target - Where to reboot to, i.e. fastboot or bootloader.
     * @param {boolean} wait - Whether to wait for the device to reconnect.
     * @param {ReconnectCallback} onReconnect - Callback to request device reconnection, if wait is enabled.
     */
    reboot(target?: string, wait?: boolean, onReconnect?: ReconnectCallback): Promise<void>;
    /**
     * Reboot to the given target and switch slot, and optionally wait for the device to
     * reconnect.
     *
     * @param {string} target - Where to reboot to, i.e. fastboot or bootloader.
     * @param {boolean} wait - Whether to wait for the device to reconnect.
     * @param {ReconnectCallback} onReconnect - Callback to request device reconnection, if wait is enabled.
     */
    rebootSwitchSlot(target?: string, wait?: boolean, onReconnect?: ReconnectCallback): Promise<void>;
    /**
     * Flash the given Blob to the given partition and slot on the device. Any image
     * format supported by the bootloader is allowed, e.g. sparse or raw images.
     * Large raw images will be converted to sparse images automatically, and
     * large sparse images will be split and flashed in multiple passes
     * depending on the bootloader's payload size limit.
     *
     * @param {string} partition - The name of the partition to flash.
     * @param {string} slot - The slot to flash, defaults to current
     * @param {Blob} blob - The Blob to retrieve data from.
     * @param {FlashProgressCallback} onProgress - Callback for flashing progress updates.
     * @throws {FastbootError}
     */
    flashBlob(partition: string, slot: string | undefined, blob: Blob, onProgress?: FlashProgressCallback): Promise<void>;
    /**
     * Boot the given Blob on the device.
     * Equivalent to `fastboot boot boot.img`.
     *
     * @param {Blob} blob - The Blob to retrieve data from.
     * @param {FlashProgressCallback} onProgress - Callback for flashing progress updates.
     * @throws {FastbootError}
     */
    bootBlob(blob: Blob, onProgress?: FlashProgressCallback): Promise<void>;
    /**
     * Flash the given factory images zip onto the device, with automatic handling
     * of firmware, system, and logical partitions as AOSP fastboot and
     * flash-all.sh would do.
     * Equivalent to `fastboot update name.zip`.
     *
     * @param {Blob} blob - Blob containing the zip file to flash.
     * @param {boolean} wipe - Whether to wipe super and userdata. Equivalent to `fastboot -w`.
     * @param {ReconnectCallback} onReconnect - Callback to request device reconnection.
     * @param {FactoryProgressCallback} onProgress - Progress callback for image flashing.
     */
    flashFactoryZip(blob: Blob, wipe: boolean, onReconnect: ReconnectCallback, onProgress?: FactoryProgressCallback): Promise<void>;
    /**
     * Determine the other slot
     * Hardcoded for A/B currently as that's what we mostly have in the field
     *
     */
    getOtherSlot(): Promise<"b" | "a">;
}
export {};
//# sourceMappingURL=fastboot.d.ts.map