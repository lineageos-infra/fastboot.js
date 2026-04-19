export declare const FILE_HEADER_SIZE = 28;
export interface SparseSplit {
    data: ArrayBuffer;
    bytes: number;
}
export declare enum ChunkType {
    Raw = 51905,
    Fill = 51906,
    Skip = 51907,
    Crc32 = 51908
}
export interface SparseHeader {
    blockSize: number;
    blocks: number;
    chunks: number;
    crc32: number;
}
export interface SparseChunk {
    type: ChunkType;
    blocks: number;
    dataBytes: number;
    data: Blob | null;
}
/**
 * Returns a parsed version of the sparse image file header from the given buffer.
 *
 * @param {ArrayBuffer} buffer - Raw file header data.
 * @returns {SparseHeader} Object containing the header information.
 */
export declare function parseFileHeader(buffer: ArrayBuffer): SparseHeader | null;
export declare function createImage(header: SparseHeader, chunks: Array<SparseChunk>): Promise<Blob>;
/**
 * Creates a sparse image from buffer containing raw image data.
 *
 * @param {Blob} blob - Blob containing the raw image data.
 * @returns {Promise<Blob>} Promise that resolves the blob containing the new sparse image.
 */
export declare function fromRaw(blob: Blob): Promise<Blob>;
/**
 * Split a sparse image into smaller sparse images within the given size.
 * This takes a Blob instead of an ArrayBuffer because it may process images
 * larger than RAM.
 *
 * @param {Blob} blob - Blob containing the sparse image to split.
 * @param {number} splitSize - Maximum size per split.
 * @yields {Object} Data of the next split image and its output size in bytes.
 */
export declare function splitBlob(blob: Blob, splitSize: number): AsyncGenerator<SparseSplit, void, unknown>;
//# sourceMappingURL=sparse.d.ts.map