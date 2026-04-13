import * as common from "./common";
import { LpError } from "./errors";
import * as Sparse from "./sparse";

// Magic values
const LP_METADATA_GEOMETRY_MAGIC = 0x616c4467;
const LP_METADATA_HEADER_MAGIC = 0x414c5030;

// Layout sizes
const LP_SECTOR_SIZE = 512;
const LP_METADATA_GEOMETRY_SIZE = 4096;
const LP_PARTITION_RESERVED_BYTES = 4096;

// Version
const LP_METADATA_MAJOR_VERSION = 10;
const LP_METADATA_MINOR_VERSION_MAX = 2;
const LP_METADATA_VERSION_FOR_UPDATED_ATTR = 1;
const LP_METADATA_VERSION_FOR_EXPANDED_HEADER = 2;

// Struct sizes (packed, little-endian, from AOSP liblp)
const GEOMETRY_STRUCT_SIZE = 52;
const HEADER_V1_0_SIZE = 128;
const HEADER_V1_2_SIZE = 256;
const PARTITION_STRUCT_SIZE = 52;
const EXTENT_STRUCT_SIZE = 24;
const GROUP_STRUCT_SIZE = 48;
const BLOCK_DEVICE_STRUCT_SIZE = 64;

const LP_BLOCK_DEVICE_SLOT_SUFFIXED = 0x1;

// Partition attribute flags
const LP_PARTITION_ATTR_READONLY = 0x1;
const LP_PARTITION_ATTR_SLOT_SUFFIXED = 0x2;
const LP_PARTITION_ATTR_UPDATED = 0x4;
const LP_PARTITION_ATTR_DISABLED = 0x8;

const LP_PARTITION_ATTRIBUTE_MASK_V0 =
    LP_PARTITION_ATTR_READONLY | LP_PARTITION_ATTR_SLOT_SUFFIXED;
const LP_PARTITION_ATTRIBUTE_MASK_V1 =
    LP_PARTITION_ATTR_UPDATED | LP_PARTITION_ATTR_DISABLED;

// Extent target types
const LP_TARGET_TYPE_LINEAR = 0;

export interface LpMetadataGeometry {
    magic: number;
    structSize: number;
    checksum: Uint8Array; // 32 bytes, SHA-256
    metadataMaxSize: number;
    metadataSlotCount: number;
    logicalBlockSize: number;
}

export interface LpMetadataTableDescriptor {
    offset: number;
    numEntries: number;
    entrySize: number;
}

export interface LpMetadataHeader {
    magic: number;
    majorVersion: number;
    minorVersion: number;
    headerSize: number;
    headerChecksum: Uint8Array; // 32 bytes, SHA-256
    tablesSize: number;
    tablesChecksum: Uint8Array; // 32 bytes, SHA-256
    partitions: LpMetadataTableDescriptor;
    extents: LpMetadataTableDescriptor;
    groups: LpMetadataTableDescriptor;
    blockDevices: LpMetadataTableDescriptor;
    flags: number; // v1.2+ only
}

export interface LpMetadataPartition {
    name: string; // from char[36]
    attributes: number;
    firstExtentIndex: number;
    numExtents: number;
    groupIndex: number;
}

export interface LpMetadataExtent {
    numSectors: bigint;
    targetType: number;
    targetData: bigint;
    targetSource: number;
}

export interface LpMetadataPartitionGroup {
    name: string; // from char[36]
    flags: number;
    maximumSize: bigint;
}

export interface LpMetadataBlockDevice {
    firstLogicalSector: bigint;
    alignment: number;
    alignmentOffset: number;
    size: bigint;
    partitionName: string; // from char[36], null-trimmed
    flags: number;
}

export interface LpMetadata {
    geometry: LpMetadataGeometry;
    header: LpMetadataHeader;
    partitions: LpMetadataPartition[];
    extents: LpMetadataExtent[];
    groups: LpMetadataPartitionGroup[];
    blockDevices: LpMetadataBlockDevice[];
}

export interface WipeSuperImage {
    partitionName: string;
    data: ArrayBuffer; // sparse image
    forceSlot: boolean; // true if LP_BLOCK_DEVICE_SLOT_SUFFIXED
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nameFromFixedArray(
    view: DataView,
    offset: number,
    maxLen: number,
): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
        const b = view.getUint8(offset + i);
        if (b === 0) break;
        bytes.push(b);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
}

async function sha256(buffer: ArrayBuffer): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return new Uint8Array(digest);
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function concatBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLen = buffers.reduce((acc, b) => acc + b.byteLength, 0);
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const buf of buffers) {
        out.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
    }
    return out.buffer;
}

// Pad/truncate buffer to exactly `size` bytes (zero-padded at end).
function padBuffer(buf: ArrayBuffer, size: number): ArrayBuffer {
    if (buf.byteLength === size) return buf;
    const out = new Uint8Array(size);
    out.set(new Uint8Array(buf.slice(0, Math.min(buf.byteLength, size))));
    return out.buffer;
}

// ---------------------------------------------------------------------------
// Geometry parsing
// ---------------------------------------------------------------------------

async function parseGeometry(buffer: ArrayBuffer): Promise<LpMetadataGeometry> {
    if (buffer.byteLength < GEOMETRY_STRUCT_SIZE) {
        throw new LpError("Geometry buffer too small");
    }
    const view = new DataView(buffer);

    const magic = view.getUint32(0, true);
    if (magic !== LP_METADATA_GEOMETRY_MAGIC) {
        throw new LpError(`Invalid geometry magic: 0x${magic.toString(16)}`);
    }

    const structSize = view.getUint32(4, true);
    if (structSize > LP_METADATA_GEOMETRY_SIZE) {
        throw new LpError(
            `Geometry struct_size ${structSize} exceeds LP_METADATA_GEOMETRY_SIZE`,
        );
    }

    const storedChecksum = new Uint8Array(buffer.slice(8, 40));

    // Verify checksum: zero the checksum field and hash
    const forHash = new Uint8Array(buffer.slice(0, structSize));
    forHash.fill(0, 8, 40);
    const computed = await sha256(forHash.buffer);
    if (!arraysEqual(computed, storedChecksum)) {
        throw new LpError("Geometry checksum mismatch");
    }

    const metadataMaxSize = view.getUint32(40, true);
    const metadataSlotCount = view.getUint32(44, true);
    const logicalBlockSize = view.getUint32(48, true);

    if (structSize !== GEOMETRY_STRUCT_SIZE) {
        throw new LpError(
            `Geometry struct_size ${structSize} does not match expected ${GEOMETRY_STRUCT_SIZE}`,
        );
    }
    if (metadataSlotCount === 0) {
        throw new LpError("Geometry has invalid slot count (0)");
    }
    if (metadataMaxSize % LP_SECTOR_SIZE !== 0) {
        throw new LpError(
            `Geometry metadata_max_size ${metadataMaxSize} is not sector-aligned`,
        );
    }

    return {
        magic,
        structSize,
        checksum: storedChecksum,
        metadataMaxSize,
        metadataSlotCount,
        logicalBlockSize,
    };
}

// ---------------------------------------------------------------------------
// Table descriptor parsing
// ---------------------------------------------------------------------------

function parseTableDescriptor(
    view: DataView,
    offset: number,
): LpMetadataTableDescriptor {
    return {
        offset: view.getUint32(offset + 0, true),
        numEntries: view.getUint32(offset + 4, true),
        entrySize: view.getUint32(offset + 8, true),
    };
}

function validateTableBounds(
    header: Pick<LpMetadataHeader, "tablesSize">,
    table: LpMetadataTableDescriptor,
): boolean {
    if (table.offset > header.tablesSize) return false;
    const tableSize = table.numEntries * table.entrySize;
    if (tableSize < 0) return false;
    if (header.tablesSize - table.offset < tableSize) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

async function parseHeader(
    buffer: ArrayBuffer,
    tablesBuffer: ArrayBuffer,
): Promise<LpMetadataHeader> {
    if (buffer.byteLength < HEADER_V1_0_SIZE) {
        throw new LpError("Header buffer too small");
    }
    const view = new DataView(buffer);

    const magic = view.getUint32(0, true);
    if (magic !== LP_METADATA_HEADER_MAGIC) {
        throw new LpError(`Invalid header magic: 0x${magic.toString(16)}`);
    }

    const majorVersion = view.getUint16(4, true);
    const minorVersion = view.getUint16(6, true);
    if (majorVersion !== LP_METADATA_MAJOR_VERSION) {
        throw new LpError(
            `Unsupported LP metadata major version: ${majorVersion}`,
        );
    }
    if (minorVersion > LP_METADATA_MINOR_VERSION_MAX) {
        throw new LpError(
            `Unsupported LP metadata minor version: ${minorVersion}`,
        );
    }

    const headerSize = view.getUint32(8, true);
    const expectedHeaderSize =
        minorVersion < LP_METADATA_VERSION_FOR_EXPANDED_HEADER
            ? HEADER_V1_0_SIZE
            : HEADER_V1_2_SIZE;
    if (headerSize !== expectedHeaderSize || headerSize > buffer.byteLength) {
        throw new LpError(`Invalid header size: ${headerSize}`);
    }

    const storedChecksum = new Uint8Array(buffer.slice(12, 44));

    // Verify header checksum
    const forHash = new Uint8Array(buffer.slice(0, headerSize));
    forHash.fill(0, 12, 44);
    const computed = await sha256(forHash.buffer);
    if (!arraysEqual(computed, storedChecksum)) {
        throw new LpError("Header checksum mismatch");
    }

    const tablesSize = view.getUint32(44, true);
    const tablesChecksum = new Uint8Array(buffer.slice(48, 80));

    // Verify tables checksum
    if (tablesBuffer.byteLength < tablesSize) {
        throw new LpError("Tables buffer too small");
    }
    const tablesComputed = await sha256(tablesBuffer.slice(0, tablesSize));
    if (!arraysEqual(tablesComputed, tablesChecksum)) {
        throw new LpError("Tables checksum mismatch");
    }

    // Table descriptors start at offset 80
    const partitions = parseTableDescriptor(view, 80);
    const extents = parseTableDescriptor(view, 92);
    const groups = parseTableDescriptor(view, 104);
    const blockDevices = parseTableDescriptor(view, 116);
    if (
        !validateTableBounds({ tablesSize }, partitions) ||
        !validateTableBounds({ tablesSize }, extents) ||
        !validateTableBounds({ tablesSize }, groups) ||
        !validateTableBounds({ tablesSize }, blockDevices)
    ) {
        throw new LpError("Invalid table bounds in metadata header");
    }

    // v1.2+ flags field at offset 128
    const flags =
        headerSize >= HEADER_V1_2_SIZE ? view.getUint32(128, true) : 0;

    return {
        magic,
        majorVersion,
        minorVersion,
        headerSize,
        headerChecksum: storedChecksum,
        tablesSize,
        tablesChecksum,
        partitions,
        extents,
        groups,
        blockDevices,
        flags,
    };
}

// ---------------------------------------------------------------------------
// Table entry parsers
// ---------------------------------------------------------------------------

function parsePartition(view: DataView, offset: number): LpMetadataPartition {
    return {
        name: nameFromFixedArray(view, offset + 0, 36),
        attributes: view.getUint32(offset + 36, true),
        firstExtentIndex: view.getUint32(offset + 40, true),
        numExtents: view.getUint32(offset + 44, true),
        groupIndex: view.getUint32(offset + 48, true),
    };
}

function parseExtent(view: DataView, offset: number): LpMetadataExtent {
    return {
        numSectors: view.getBigUint64(offset + 0, true),
        targetType: view.getUint32(offset + 8, true),
        targetData: view.getBigUint64(offset + 12, true),
        targetSource: view.getUint32(offset + 20, true),
    };
}

function parseGroup(view: DataView, offset: number): LpMetadataPartitionGroup {
    return {
        name: nameFromFixedArray(view, offset + 0, 36),
        flags: view.getUint32(offset + 36, true),
        maximumSize: view.getBigUint64(offset + 40, true),
    };
}

function parseBlockDevice(
    view: DataView,
    offset: number,
): LpMetadataBlockDevice {
    return {
        firstLogicalSector: view.getBigUint64(offset + 0, true),
        alignment: view.getUint32(offset + 8, true),
        alignmentOffset: view.getUint32(offset + 12, true),
        size: view.getBigUint64(offset + 16, true),
        partitionName: nameFromFixedArray(view, offset + 24, 36),
        flags: view.getUint32(offset + 60, true),
    };
}

function parseTable<T>(
    tablesView: DataView,
    descriptor: LpMetadataTableDescriptor,
    expectedEntrySize: number,
    parser: (view: DataView, offset: number) => T,
): T[] {
    if (descriptor.entrySize !== expectedEntrySize) {
        throw new LpError(
            `Table entry size mismatch: expected ${expectedEntrySize}, got ${descriptor.entrySize}`,
        );
    }
    const tableSize = descriptor.numEntries * descriptor.entrySize;
    if (
        descriptor.offset > tablesView.byteLength ||
        tableSize > tablesView.byteLength - descriptor.offset
    ) {
        throw new LpError("Table descriptor points outside tables buffer");
    }
    const results: T[] = [];
    for (let i = 0; i < descriptor.numEntries; i++) {
        const offset = descriptor.offset + i * descriptor.entrySize;
        results.push(parser(tablesView, offset));
    }
    return results;
}

function validateParsedMetadata(
    geometry: LpMetadataGeometry,
    header: LpMetadataHeader,
    partitions: LpMetadataPartition[],
    extents: LpMetadataExtent[],
    groups: LpMetadataPartitionGroup[],
    blockDevices: LpMetadataBlockDevice[],
) {
    const superDevice = blockDevices[0];
    if (!superDevice) {
        throw new LpError("Metadata does not specify a super block device");
    }

    const validAttributes =
        header.minorVersion >= LP_METADATA_VERSION_FOR_UPDATED_ATTR
            ? LP_PARTITION_ATTRIBUTE_MASK_V0 | LP_PARTITION_ATTRIBUTE_MASK_V1
            : LP_PARTITION_ATTRIBUTE_MASK_V0;

    for (const partition of partitions) {
        if (partition.attributes & ~validAttributes) {
            throw new LpError(
                `Partition "${partition.name}" has invalid attributes`,
            );
        }
        const end = partition.firstExtentIndex + partition.numExtents;
        if (end < partition.firstExtentIndex || end > extents.length) {
            throw new LpError(
                `Partition "${partition.name}" has invalid extent list`,
            );
        }
        if (partition.groupIndex >= groups.length) {
            throw new LpError(
                `Partition "${partition.name}" has invalid group index`,
            );
        }
    }

    for (const extent of extents) {
        if (
            extent.targetType === LP_TARGET_TYPE_LINEAR &&
            extent.targetSource >= blockDevices.length
        ) {
            throw new LpError("Linear extent references invalid block device");
        }
    }

    const metadataRegion =
        BigInt(LP_PARTITION_RESERVED_BYTES) +
        BigInt(
            LP_METADATA_GEOMETRY_SIZE +
                geometry.metadataMaxSize * geometry.metadataSlotCount,
        ) *
            2n;
    if (
        metadataRegion >
        superDevice.firstLogicalSector * BigInt(LP_SECTOR_SIZE)
    ) {
        throw new LpError(
            "Metadata region overlaps with logical partition contents",
        );
    }
}

// ---------------------------------------------------------------------------
// Public: read LP metadata from a super_empty.img Blob
// ---------------------------------------------------------------------------

/**
 * Parse LP metadata from a super_empty.img Blob.
 *
 * super_empty.img layout:
 *   [0 .. LP_METADATA_GEOMETRY_SIZE)  — geometry struct (4096 bytes)
 *   [LP_METADATA_GEOMETRY_SIZE ..)    — header + tables (metadata slot 0)
 */
export async function readFromImageBlob(blob: Blob): Promise<LpMetadata> {
    common.logDebug(`Parsing LP metadata from ${blob.size}-byte image`);

    // super_empty.img written by AOSP WriteToImageFile(fd, metadata) has:
    //   offset 0                    — geometry (LP_METADATA_GEOMETRY_SIZE bytes, padded)
    //   offset LP_METADATA_GEOMETRY_SIZE — header + tables
    // This matches AOSP ReadFromImageBlob / ReadFromImageFile which reads geometry at offset 0.
    const primaryGeometryOffset = 0;
    const geomBuf = await common.readBlobAsBuffer(
        blob.slice(
            primaryGeometryOffset,
            primaryGeometryOffset + LP_METADATA_GEOMETRY_SIZE,
        ),
    );
    const geometry = await parseGeometry(geomBuf);
    common.logDebug(
        `LP geometry: maxSize=${geometry.metadataMaxSize}, slotCount=${geometry.metadataSlotCount}, blockSize=${geometry.logicalBlockSize}`,
    );

    // Metadata immediately follows the single geometry block in super_empty.img
    const headerPeekOffset = LP_METADATA_GEOMETRY_SIZE;
    const headerPeekBuf = await common.readBlobAsBuffer(
        blob.slice(headerPeekOffset, headerPeekOffset + HEADER_V1_0_SIZE),
    );
    const peekView = new DataView(headerPeekBuf);
    const headerSize = peekView.getUint32(8, true);
    const tablesSize = peekView.getUint32(44, true);
    if (tablesSize > geometry.metadataMaxSize) {
        throw new LpError("Metadata tables exceed geometry.metadata_max_size");
    }

    // Read full header + tables
    const headerBuf = await common.readBlobAsBuffer(
        blob.slice(headerPeekOffset, headerPeekOffset + headerSize),
    );
    const tablesBuf = await common.readBlobAsBuffer(
        blob.slice(
            headerPeekOffset + headerSize,
            headerPeekOffset + headerSize + tablesSize,
        ),
    );

    const header = await parseHeader(headerBuf, tablesBuf);
    common.logDebug(
        `LP header: v${header.majorVersion}.${header.minorVersion}, headerSize=${header.headerSize}`,
    );

    const tablesView = new DataView(tablesBuf);
    const partitions = parseTable(
        tablesView,
        header.partitions,
        PARTITION_STRUCT_SIZE,
        parsePartition,
    );
    const extents = parseTable(
        tablesView,
        header.extents,
        EXTENT_STRUCT_SIZE,
        parseExtent,
    );
    const groups = parseTable(
        tablesView,
        header.groups,
        GROUP_STRUCT_SIZE,
        parseGroup,
    );
    const blockDevices = parseTable(
        tablesView,
        header.blockDevices,
        BLOCK_DEVICE_STRUCT_SIZE,
        parseBlockDevice,
    );

    validateParsedMetadata(
        geometry,
        header,
        partitions,
        extents,
        groups,
        blockDevices,
    );

    common.logDebug(
        `LP: ${partitions.length} partitions, ${blockDevices.length} block device(s)`,
    );
    for (const bd of blockDevices) {
        common.logDebug(
            `  block device "${bd.partitionName}": size=${
                bd.size
            }, flags=0x${bd.flags.toString(16)}`,
        );
    }

    return { geometry, header, partitions, extents, groups, blockDevices };
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function getMetadataSuperBlockDevice(
    metadata: LpMetadata,
): LpMetadataBlockDevice | null {
    return metadata.blockDevices[0] ?? null;
}

export function getBlockDevicePartitionName(bd: LpMetadataBlockDevice): string {
    return bd.partitionName;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export async function serializeGeometry(
    geometry: LpMetadataGeometry,
): Promise<ArrayBuffer> {
    const buf = new ArrayBuffer(GEOMETRY_STRUCT_SIZE);
    const view = new DataView(buf);

    view.setUint32(0, geometry.magic, true);
    view.setUint32(4, geometry.structSize, true);
    // checksum at [8..40] — zeroed for hashing
    view.setUint32(40, geometry.metadataMaxSize, true);
    view.setUint32(44, geometry.metadataSlotCount, true);
    view.setUint32(48, geometry.logicalBlockSize, true);

    // Compute checksum over the struct with checksum field zeroed
    const checksum = await sha256(buf);
    const out = new Uint8Array(buf);
    out.set(checksum, 8);

    // Pad to LP_METADATA_GEOMETRY_SIZE
    return padBuffer(buf, LP_METADATA_GEOMETRY_SIZE);
}

function serializeTableDescriptor(
    view: DataView,
    offset: number,
    desc: LpMetadataTableDescriptor,
) {
    view.setUint32(offset + 0, desc.offset, true);
    view.setUint32(offset + 4, desc.numEntries, true);
    view.setUint32(offset + 8, desc.entrySize, true);
}

function serializeNameToFixedArray(
    view: DataView,
    offset: number,
    name: string,
    maxLen: number,
) {
    const encoded = new TextEncoder().encode(name);
    for (let i = 0; i < maxLen; i++) {
        view.setUint8(offset + i, i < encoded.length ? encoded[i] : 0);
    }
}

function serializePartition(partition: LpMetadataPartition): ArrayBuffer {
    const buf = new ArrayBuffer(PARTITION_STRUCT_SIZE);
    const view = new DataView(buf);
    serializeNameToFixedArray(view, 0, partition.name, 36);
    view.setUint32(36, partition.attributes, true);
    view.setUint32(40, partition.firstExtentIndex, true);
    view.setUint32(44, partition.numExtents, true);
    view.setUint32(48, partition.groupIndex, true);
    return buf;
}

function serializeExtent(extent: LpMetadataExtent): ArrayBuffer {
    const buf = new ArrayBuffer(EXTENT_STRUCT_SIZE);
    const view = new DataView(buf);
    view.setBigUint64(0, extent.numSectors, true);
    view.setUint32(8, extent.targetType, true);
    view.setBigUint64(12, extent.targetData, true);
    view.setUint32(20, extent.targetSource, true);
    return buf;
}

function serializeGroup(group: LpMetadataPartitionGroup): ArrayBuffer {
    const buf = new ArrayBuffer(GROUP_STRUCT_SIZE);
    const view = new DataView(buf);
    serializeNameToFixedArray(view, 0, group.name, 36);
    view.setUint32(36, group.flags, true);
    view.setBigUint64(40, group.maximumSize, true);
    return buf;
}

function serializeBlockDevice(bd: LpMetadataBlockDevice): ArrayBuffer {
    const buf = new ArrayBuffer(BLOCK_DEVICE_STRUCT_SIZE);
    const view = new DataView(buf);
    view.setBigUint64(0, bd.firstLogicalSector, true);
    view.setUint32(8, bd.alignment, true);
    view.setUint32(12, bd.alignmentOffset, true);
    view.setBigUint64(16, bd.size, true);
    serializeNameToFixedArray(view, 24, bd.partitionName, 36);
    view.setUint32(60, bd.flags, true);
    return buf;
}

export async function serializeMetadata(
    metadata: LpMetadata,
): Promise<ArrayBuffer> {
    const { header, geometry } = metadata;

    // Serialize each table
    const partitionBufs = metadata.partitions.map(serializePartition);
    const extentBufs = metadata.extents.map(serializeExtent);
    const groupBufs = metadata.groups.map(serializeGroup);
    const blockDevBufs = metadata.blockDevices.map(serializeBlockDevice);

    const tablesParts = [
        ...partitionBufs,
        ...extentBufs,
        ...groupBufs,
        ...blockDevBufs,
    ];
    const tablesBuffer = concatBuffers(...tablesParts);

    // Compute table descriptor offsets
    const partitionsOffset = 0;
    const extentsOffset = partitionBufs.reduce((s, b) => s + b.byteLength, 0);
    const groupsOffset =
        extentsOffset + extentBufs.reduce((s, b) => s + b.byteLength, 0);
    const blockDevicesOffset =
        groupsOffset + groupBufs.reduce((s, b) => s + b.byteLength, 0);

    const tablesChecksum = await sha256(tablesBuffer);
    const tablesSize = tablesBuffer.byteLength;

    // Enforce header size that matches metadata minor version.
    const headerSize =
        header.minorVersion < LP_METADATA_VERSION_FOR_EXPANDED_HEADER
            ? HEADER_V1_0_SIZE
            : HEADER_V1_2_SIZE;

    const headerBuf = new ArrayBuffer(headerSize);
    const hv = new DataView(headerBuf);

    hv.setUint32(0, LP_METADATA_HEADER_MAGIC, true);
    hv.setUint16(4, header.majorVersion, true);
    hv.setUint16(6, header.minorVersion, true);
    hv.setUint32(8, headerSize, true);
    // [12..44]: headerChecksum — zeroed initially for hashing
    hv.setUint32(44, tablesSize, true);
    new Uint8Array(headerBuf).set(tablesChecksum, 48); // tablesChecksum at [48..80]

    // Table descriptors
    const hDescView = new DataView(headerBuf);
    serializeTableDescriptor(hDescView, 80, {
        offset: partitionsOffset,
        numEntries: metadata.partitions.length,
        entrySize: PARTITION_STRUCT_SIZE,
    });
    serializeTableDescriptor(hDescView, 92, {
        offset: extentsOffset,
        numEntries: metadata.extents.length,
        entrySize: EXTENT_STRUCT_SIZE,
    });
    serializeTableDescriptor(hDescView, 104, {
        offset: groupsOffset,
        numEntries: metadata.groups.length,
        entrySize: GROUP_STRUCT_SIZE,
    });
    serializeTableDescriptor(hDescView, 116, {
        offset: blockDevicesOffset,
        numEntries: metadata.blockDevices.length,
        entrySize: BLOCK_DEVICE_STRUCT_SIZE,
    });

    if (headerSize >= HEADER_V1_2_SIZE) {
        hv.setUint32(128, header.flags, true);
    }

    // Compute header checksum
    const headerChecksum = await sha256(headerBuf);
    new Uint8Array(headerBuf).set(headerChecksum, 12);

    return concatBuffers(headerBuf, tablesBuffer);
}

// ---------------------------------------------------------------------------
// Public: build wipe-super sparse images (one per block device)
// ---------------------------------------------------------------------------

/**
 * Generate sparse images suitable for flashing to wipe the super partition.
 *
 * The first block device image contains the LP metadata region (reserved zeros +
 * geometry copies + metadata slots) followed by a skip chunk for the remaining
 * device space.  Secondary block devices (retrofit) get a skip-only image.
 */
export async function buildWipeSuperImages(
    metadata: LpMetadata,
): Promise<WipeSuperImage[]> {
    const { geometry } = metadata;
    const blockSize = geometry.logicalBlockSize;

    // Validate alignment requirements (matching AOSP ImageBuilder constructor checks)
    if (blockSize % LP_SECTOR_SIZE !== 0) {
        throw new LpError(
            `Block size ${blockSize} must be a multiple of sector size ${LP_SECTOR_SIZE}`,
        );
    }
    if (LP_METADATA_GEOMETRY_SIZE % blockSize !== 0) {
        throw new LpError(
            `Geometry size ${LP_METADATA_GEOMETRY_SIZE} is not a multiple of block size ${blockSize}`,
        );
    }
    if (LP_PARTITION_RESERVED_BYTES % blockSize !== 0) {
        throw new LpError(
            `Reserved size ${LP_PARTITION_RESERVED_BYTES} is not a multiple of block size ${blockSize}`,
        );
    }
    if (geometry.metadataMaxSize % blockSize !== 0) {
        throw new LpError(
            `Metadata max size ${geometry.metadataMaxSize} must be a multiple of block size ${blockSize}`,
        );
    }

    // Serialize geometry and metadata once — shared across all metadata slot copies
    const [geomBuf, rawMetaBuf] = await Promise.all([
        serializeGeometry(geometry),
        serializeMetadata(metadata),
    ]);

    // Pad metadata blob to metadataMaxSize
    const metaBuf = padBuffer(rawMetaBuf, geometry.metadataMaxSize);

    // allMetadata = geometry x2 + (primary slots x slotCount) + (backup slots x slotCount)
    const slotCount = geometry.metadataSlotCount;
    const allMetaParts: ArrayBuffer[] = [
        geomBuf,
        geomBuf,
        ...Array(slotCount).fill(metaBuf),
        ...Array(slotCount).fill(metaBuf),
    ];
    const allMetadata = concatBuffers(...allMetaParts);
    const metadataBlocks = allMetadata.byteLength / blockSize;
    const reservedBlocks = LP_PARTITION_RESERVED_BYTES / blockSize;

    const results: WipeSuperImage[] = [];

    for (let i = 0; i < metadata.blockDevices.length; i++) {
        const bd = metadata.blockDevices[i];
        const partitionName = getBlockDevicePartitionName(bd);
        const forceSlot = !!(bd.flags & LP_BLOCK_DEVICE_SLOT_SUFFIXED);

        // Validate device size alignment and sparse block-count range
        if (bd.size % BigInt(blockSize) !== 0n) {
            throw new LpError(
                `Device "${partitionName}" size ${bd.size} is not a multiple of block size ${blockSize}`,
            );
        }
        const deviceBlocks = Number(bd.size) / blockSize;
        if (deviceBlocks >= 0xffffffff) {
            throw new LpError(
                `Device "${partitionName}" is too large to encode with sparse format`,
            );
        }

        let sparseBlob: Blob;

        if (i === 0) {
            // Primary super device: write reserved zeros + metadata region + skip rest
            const skipBlocks = deviceBlocks - reservedBlocks - metadataBlocks;
            if (skipBlocks < 0) {
                throw new LpError(
                    `Device "${partitionName}" is too small to hold LP metadata`,
                );
            }

            const sparseHeader: Sparse.SparseHeader = {
                blockSize,
                blocks: deviceBlocks,
                chunks: 3,
                crc32: 0,
            };
            const chunks: Sparse.SparseChunk[] = [
                {
                    type: Sparse.ChunkType.Fill,
                    blocks: reservedBlocks,
                    dataBytes: 4,
                    data: new Blob([new Uint32Array([0]).buffer]),
                },
                {
                    type: Sparse.ChunkType.Raw,
                    blocks: metadataBlocks,
                    dataBytes: allMetadata.byteLength,
                    data: new Blob([allMetadata]),
                },
                {
                    type: Sparse.ChunkType.Skip,
                    blocks: skipBlocks,
                    dataBytes: 0,
                    data: new Blob([]),
                },
            ];
            sparseBlob = await Sparse.createImage(sparseHeader, chunks);
        } else {
            // Secondary retrofit device: skip-only image (no metadata stored here)
            const sparseHeader: Sparse.SparseHeader = {
                blockSize,
                blocks: deviceBlocks,
                chunks: 1,
                crc32: 0,
            };
            const chunks: Sparse.SparseChunk[] = [
                {
                    type: Sparse.ChunkType.Skip,
                    blocks: deviceBlocks,
                    dataBytes: 0,
                    data: new Blob([]),
                },
            ];
            sparseBlob = await Sparse.createImage(sparseHeader, chunks);
        }

        const data = await common.readBlobAsBuffer(sparseBlob);
        common.logDebug(
            `Generated ${data.byteLength}-byte sparse image for "${partitionName}"`,
        );

        results.push({ partitionName, data, forceSlot });
    }

    return results;
}
