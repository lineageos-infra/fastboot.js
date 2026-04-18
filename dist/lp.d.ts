export interface LpMetadataGeometry {
    magic: number;
    structSize: number;
    checksum: Uint8Array;
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
    headerChecksum: Uint8Array;
    tablesSize: number;
    tablesChecksum: Uint8Array;
    partitions: LpMetadataTableDescriptor;
    extents: LpMetadataTableDescriptor;
    groups: LpMetadataTableDescriptor;
    blockDevices: LpMetadataTableDescriptor;
    flags: number;
}
export interface LpMetadataPartition {
    name: string;
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
    name: string;
    flags: number;
    maximumSize: bigint;
}
export interface LpMetadataBlockDevice {
    firstLogicalSector: bigint;
    alignment: number;
    alignmentOffset: number;
    size: bigint;
    partitionName: string;
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
    data: ArrayBuffer;
    forceSlot: boolean;
}
/**
 * Parse LP metadata from a super_empty.img Blob.
 *
 * super_empty.img layout:
 *   [0 .. LP_METADATA_GEOMETRY_SIZE)  — geometry struct (4096 bytes)
 *   [LP_METADATA_GEOMETRY_SIZE ..)    — header + tables (metadata slot 0)
 */
export declare function readFromImageBlob(blob: Blob): Promise<LpMetadata>;
export declare function getMetadataSuperBlockDevice(metadata: LpMetadata): LpMetadataBlockDevice | null;
export declare function getBlockDevicePartitionName(bd: LpMetadataBlockDevice): string;
export declare function serializeGeometry(geometry: LpMetadataGeometry): Promise<ArrayBuffer>;
export declare function serializeMetadata(metadata: LpMetadata): Promise<ArrayBuffer>;
/**
 * Generate sparse images suitable for flashing to wipe the super partition.
 *
 * The first block device image contains the LP metadata region (reserved zeros +
 * geometry copies + metadata slots) followed by a skip chunk for the remaining
 * device space.  Secondary block devices (retrofit) get a skip-only image.
 */
export declare function buildWipeSuperImages(metadata: LpMetadata): Promise<WipeSuperImage[]>;
//# sourceMappingURL=lp.d.ts.map