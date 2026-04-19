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
