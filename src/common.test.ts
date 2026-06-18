import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBlobAsBuffer } from './common'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readBlobAsBuffer', () => {
  it('reads blob contents into an ArrayBuffer', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 255])
    const blob = new Blob([bytes])

    const buffer = await readBlobAsBuffer(blob)

    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(buffer)).toEqual(bytes)
  })

  it('resolves an empty buffer for an empty blob', async () => {
    const buffer = await readBlobAsBuffer(new Blob([]))
    expect(buffer.byteLength).toBe(0)
  })

  it('rejects with the reader error when reading fails', async () => {
    const readError = new Error('read failed')
    vi.stubGlobal(
      'FileReader',
      class {
        error = readError
        onerror: (() => void) | null = null
        onload: (() => void) | null = null
        readAsArrayBuffer() {
          queueMicrotask(() => this.onerror?.())
        }
      }
    )

    await expect(readBlobAsBuffer(new Blob([]))).rejects.toBe(readError)
  })
})
