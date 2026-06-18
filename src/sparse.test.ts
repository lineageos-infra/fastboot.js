import { describe, expect, it } from 'vitest'
import { readBlobAsBuffer } from './common'
import {
  ChunkType,
  createImage,
  FILE_HEADER_SIZE,
  fromRaw,
  parseFileHeader,
  splitBlob,
  type SparseChunk,
  type SparseHeader
} from './sparse'
import { ImageError } from './utils/errors'

const FILE_MAGIC = 0xed26ff3a
const CHUNK_HEADER_SIZE = 12

/** Build a 28-byte sparse file header with valid defaults, overridable per-field. */
function buildHeaderBuffer(overrides: Partial<Record<string, number>> = {}): ArrayBuffer {
  const fields = {
    magic: FILE_MAGIC,
    major: 1,
    minor: 0,
    fileHdrSize: FILE_HEADER_SIZE,
    chunkHdrSize: CHUNK_HEADER_SIZE,
    blockSize: 4096,
    blocks: 10,
    chunks: 2,
    crc32: 0,
    ...overrides
  }
  const buffer = new ArrayBuffer(FILE_HEADER_SIZE)
  const view = new DataView(buffer)
  view.setUint32(0, fields.magic, true)
  view.setUint16(4, fields.major, true)
  view.setUint16(6, fields.minor, true)
  view.setUint16(8, fields.fileHdrSize, true)
  view.setUint16(10, fields.chunkHdrSize, true)
  view.setUint32(12, fields.blockSize, true)
  view.setUint32(16, fields.blocks, true)
  view.setUint32(20, fields.chunks, true)
  view.setUint32(24, fields.crc32, true)
  return buffer
}

describe('parseFileHeader', () => {
  it('parses a valid header', () => {
    const header = parseFileHeader(buildHeaderBuffer({ blocks: 42, chunks: 3 }))
    expect(header).toEqual<SparseHeader>({
      blockSize: 4096,
      blocks: 42,
      chunks: 3,
      crc32: 0
    })
  })

  it('returns null when the magic does not match', () => {
    expect(parseFileHeader(buildHeaderBuffer({ magic: 0xdeadbeef }))).toBeNull()
  })

  it('throws on an unsupported version', () => {
    expect(() => parseFileHeader(buildHeaderBuffer({ major: 2 }))).toThrow(ImageError)
  })

  it('throws on a bad header size', () => {
    expect(() => parseFileHeader(buildHeaderBuffer({ fileHdrSize: 32 }))).toThrow(ImageError)
  })

  it('throws when block size is not a multiple of 4', () => {
    expect(() => parseFileHeader(buildHeaderBuffer({ blockSize: 4095 }))).toThrow(ImageError)
  })
})

describe('fromRaw', () => {
  it('produces a parseable sparse image from raw data', async () => {
    const rawBytes = new Uint8Array(8192).fill(0xab)
    const sparse = await fromRaw(new Blob([rawBytes]))

    const header = parseFileHeader(await readBlobAsBuffer(sparse.slice(0, FILE_HEADER_SIZE)))
    expect(header).not.toBeNull()
    expect(header!.blockSize).toBe(4096)
    expect(header!.blocks).toBe(2)
    expect(header!.chunks).toBe(1)
  })
})

describe('createImage', () => {
  it('writes a header reflecting the chunk count', async () => {
    const header: SparseHeader = { blockSize: 4096, blocks: 1, chunks: 1, crc32: 0 }
    const chunk: SparseChunk = {
      type: ChunkType.Raw,
      blocks: 1,
      dataBytes: 4096,
      data: new Blob([new Uint8Array(4096).fill(7)])
    }

    const image = await createImage(header, [chunk])
    const buffer = await readBlobAsBuffer(image)
    const view = new DataView(buffer)

    expect(view.getUint32(0, true)).toBe(FILE_MAGIC)
    expect(view.getUint32(20, true)).toBe(1) // chunk count
    // header + chunk header + chunk data
    expect(image.size).toBe(FILE_HEADER_SIZE + CHUNK_HEADER_SIZE + 4096)
  })
})

/** Collect an async generator into an array. */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of gen) {
    out.push(item)
  }
  return out
}

describe('splitBlob', () => {
  it('yields a single payload when the image fits within splitSize', async () => {
    const sparse = await fromRaw(new Blob([new Uint8Array(4096).fill(1)]))
    const splits = await collect(splitBlob(sparse, sparse.size + 1000))

    expect(splits).toHaveLength(1)
    expect(splits[0].bytes).toBe(sparse.size)
  })

  it('splits a multi-chunk image and preserves total written bytes', async () => {
    const blockSize = 4096
    const blocks = 4
    const header: SparseHeader = { blockSize, blocks, chunks: blocks, crc32: 0 }
    const chunks: SparseChunk[] = Array.from({ length: blocks }, (_, i) => ({
      type: ChunkType.Raw,
      blocks: 1,
      dataBytes: blockSize,
      data: new Blob([new Uint8Array(blockSize).fill(i + 1)])
    }))
    const sparse = await createImage(header, chunks)

    // Small enough to force a split, large enough to hold the header + a chunk.
    const splits = await collect(splitBlob(sparse, 8400))

    expect(splits.length).toBeGreaterThan(1)

    // Every split is itself a valid sparse image covering the full partition.
    for (const split of splits) {
      const splitHeader = parseFileHeader(split.data.slice(0, FILE_HEADER_SIZE))
      expect(splitHeader).not.toBeNull()
      expect(splitHeader!.blocks).toBe(blocks)
    }

    // The data actually written across splits equals the original payload.
    const totalBytes = splits.reduce((sum, s) => sum + s.bytes, 0)
    expect(totalBytes).toBe(blocks * blockSize)
  })

  it('sub-splits a single chunk larger than the safe send size', async () => {
    const blockSize = 4096
    const blocks = 3
    const header: SparseHeader = { blockSize, blocks, chunks: 1, crc32: 0 }
    // One oversized raw chunk spanning the whole partition.
    const bigChunk: SparseChunk = {
      type: ChunkType.Raw,
      blocks,
      dataBytes: blocks * blockSize,
      data: new Blob([new Uint8Array(blocks * blockSize).fill(9)])
    }
    const sparse = await createImage(header, [bigChunk])

    // splitSize 4682 => safeSendValue floor(4682 * 7/8) == 4096 == one block,
    // so the 3-block chunk is forced through the sub-split branch.
    const splits = await collect(splitBlob(sparse, 4682))

    expect(splits.length).toBeGreaterThan(1)
    for (const split of splits) {
      expect(parseFileHeader(split.data.slice(0, FILE_HEADER_SIZE))).not.toBeNull()
    }
    const totalBytes = splits.reduce((sum, s) => sum + s.bytes, 0)
    expect(totalBytes).toBe(blocks * blockSize)
  })

  it('throws when the blob is not a sparse image', async () => {
    const notSparse = new Blob([new Uint8Array(100).fill(0)])
    await expect(collect(splitBlob(notSparse, 50))).rejects.toThrow(ImageError)
  })
})
