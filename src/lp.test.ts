import { describe, expect, it } from 'vitest'
import {
  buildWipeSuperImages,
  getBlockDevicePartitionName,
  getMetadataSuperBlockDevice,
  readFromImageBlob,
  serializeGeometry,
  serializeMetadata,
  type LpMetadata
} from './lp'
import { parseFileHeader } from './sparse'
import { LpError } from './utils/errors'

const LP_METADATA_GEOMETRY_MAGIC = 0x616c4467
const LP_METADATA_HEADER_MAGIC = 0x414c5030
const LP_BLOCK_DEVICE_SLOT_SUFFIXED = 0x1

/** A minimal but fully valid LP metadata object (one of each table entry). */
function buildMetadata(overrides: Partial<LpMetadata> = {}): LpMetadata {
  return {
    geometry: {
      magic: LP_METADATA_GEOMETRY_MAGIC,
      structSize: 52,
      checksum: new Uint8Array(32),
      metadataMaxSize: 4096,
      metadataSlotCount: 2,
      logicalBlockSize: 4096
    },
    header: {
      magic: LP_METADATA_HEADER_MAGIC,
      majorVersion: 10,
      minorVersion: 0,
      headerSize: 128,
      headerChecksum: new Uint8Array(32),
      tablesSize: 0, // recomputed by serializeMetadata
      tablesChecksum: new Uint8Array(32),
      partitions: { offset: 0, numEntries: 0, entrySize: 0 },
      extents: { offset: 0, numEntries: 0, entrySize: 0 },
      groups: { offset: 0, numEntries: 0, entrySize: 0 },
      blockDevices: { offset: 0, numEntries: 0, entrySize: 0 },
      flags: 0
    },
    partitions: [
      { name: 'system_a', attributes: 0x1, firstExtentIndex: 0, numExtents: 1, groupIndex: 0 }
    ],
    extents: [{ numSectors: 100n, targetType: 0, targetData: 0n, targetSource: 0 }],
    groups: [{ name: 'group_a', flags: 0, maximumSize: 0n }],
    blockDevices: [
      {
        firstLogicalSector: 100n,
        alignment: 0,
        alignmentOffset: 0,
        size: 1048576n, // 1 MiB
        partitionName: 'super',
        flags: 0
      }
    ],
    ...overrides
  }
}

/** Compose a super_empty.img: padded geometry block followed by header + tables. */
async function toImageBlob(metadata: LpMetadata): Promise<Blob> {
  const geom = await serializeGeometry(metadata.geometry)
  const meta = await serializeMetadata(metadata)
  return new Blob([geom, meta])
}

describe('readFromImageBlob (round-trip with serialize)', () => {
  it('recovers the tables exactly', async () => {
    const metadata = buildMetadata()
    const parsed = await readFromImageBlob(await toImageBlob(metadata))

    expect(parsed.partitions).toEqual(metadata.partitions)
    expect(parsed.extents).toEqual(metadata.extents)
    expect(parsed.groups).toEqual(metadata.groups)
    expect(parsed.blockDevices).toEqual(metadata.blockDevices)
  })

  it('recovers geometry and header fields', async () => {
    const parsed = await readFromImageBlob(await toImageBlob(buildMetadata()))

    expect(parsed.geometry).toMatchObject({
      magic: LP_METADATA_GEOMETRY_MAGIC,
      structSize: 52,
      metadataMaxSize: 4096,
      metadataSlotCount: 2,
      logicalBlockSize: 4096
    })
    expect(parsed.header).toMatchObject({
      magic: LP_METADATA_HEADER_MAGIC,
      majorVersion: 10,
      minorVersion: 0,
      headerSize: 128,
      flags: 0
    })
    expect(parsed.header.tablesSize).toBeGreaterThan(0)
  })

  it('round-trips a v1.2 (expanded header) image', async () => {
    const metadata = buildMetadata()
    metadata.header.minorVersion = 2
    metadata.header.headerSize = 256
    metadata.header.flags = 0x3

    const parsed = await readFromImageBlob(await toImageBlob(metadata))
    expect(parsed.header.minorVersion).toBe(2)
    expect(parsed.header.headerSize).toBe(256)
    expect(parsed.header.flags).toBe(0x3)
  })

  it('rejects a blob without valid geometry', async () => {
    const garbage = new Blob([new Uint8Array(8192)])
    await expect(readFromImageBlob(garbage)).rejects.toThrow(LpError)
  })

  it('rejects a tampered header (checksum mismatch)', async () => {
    const buffer = await (await toImageBlob(buildMetadata())).arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // Flip a byte inside the header table descriptors (offset 4096 = header start).
    bytes[4096 + 80] ^= 0xff
    await expect(readFromImageBlob(new Blob([bytes]))).rejects.toThrow(LpError)
  })
})

describe('getMetadataSuperBlockDevice / getBlockDevicePartitionName', () => {
  it('returns the first block device and its name', () => {
    const metadata = buildMetadata()
    const bd = getMetadataSuperBlockDevice(metadata)
    expect(bd).toBe(metadata.blockDevices[0])
    expect(getBlockDevicePartitionName(bd!)).toBe('super')
  })

  it('returns null when there are no block devices', () => {
    const metadata = buildMetadata({ blockDevices: [] })
    expect(getMetadataSuperBlockDevice(metadata)).toBeNull()
  })
})

describe('buildWipeSuperImages', () => {
  it('builds a 3-chunk sparse image for the primary super device', async () => {
    const images = await buildWipeSuperImages(buildMetadata())

    expect(images).toHaveLength(1)
    expect(images[0].partitionName).toBe('super')
    expect(images[0].forceSlot).toBe(false)

    const header = parseFileHeader(images[0].data)
    expect(header).not.toBeNull()
    expect(header!.blockSize).toBe(4096)
    expect(header!.blocks).toBe(1048576 / 4096)
    expect(header!.chunks).toBe(3)
  })

  it('flags slot-suffixed devices with forceSlot', async () => {
    const metadata = buildMetadata()
    metadata.blockDevices[0].flags = LP_BLOCK_DEVICE_SLOT_SUFFIXED
    const images = await buildWipeSuperImages(metadata)
    expect(images[0].forceSlot).toBe(true)
  })

  it('emits a skip-only image for secondary retrofit devices', async () => {
    const metadata = buildMetadata()
    metadata.blockDevices.push({
      firstLogicalSector: 0n,
      alignment: 0,
      alignmentOffset: 0,
      size: 524288n, // 0.5 MiB
      partitionName: 'super_retro',
      flags: 0
    })

    const images = await buildWipeSuperImages(metadata)
    expect(images).toHaveLength(2)
    expect(images[1].partitionName).toBe('super_retro')
    expect(parseFileHeader(images[1].data)!.chunks).toBe(1)
  })

  it('throws when the block size is not sector-aligned', async () => {
    const metadata = buildMetadata()
    metadata.geometry.logicalBlockSize = 100
    await expect(buildWipeSuperImages(metadata)).rejects.toThrow(LpError)
  })

  it('throws when the device is too small to hold metadata', async () => {
    const metadata = buildMetadata()
    metadata.blockDevices[0].size = 4096n // one block, far too small
    await expect(buildWipeSuperImages(metadata)).rejects.toThrow(LpError)
  })
})
