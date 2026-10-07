import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadBytes,
  downloadFileName,
  downloadFileStem,
  downloadText
} from './download'

describe('downloadFileName', () => {
  it('strips path punctuation and keeps a fallback stem', () => {
    expect(downloadFileStem('My layout')).toBe('My layout')
    expect(downloadFileName('ru/winkeys:a', 'klc')).toBe('ru_winkeys_a.klc')
    expect(downloadFileName('  ', 'xkb', 'layout')).toBe('layout.xkb')
    expect(downloadFileName('ok', '.symbols.txt')).toBe('ok.symbols.txt')
  })
})

describe('downloadText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clicks a blob link and revokes the object URL', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:download-test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    downloadText('hello', 'a.txt')
    expect(createObjectURL).toHaveBeenCalled()
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('text/plain;charset=utf-8')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download-test')

    downloadBytes(new Uint8Array([1, 2]), 'b.klc')
    expect(createObjectURL.mock.calls[1]?.[0]).toBeInstanceOf(Blob)
  })
})
