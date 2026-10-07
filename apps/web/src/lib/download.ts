/** Shared blob download + filename sanitizer for Host / profile exports. */

const UNSAFE_FILE_CHARS = /[\\/:*?"<>|]+/g

export function downloadFileStem(name: string, fallback = 'download'): string {
  const stem = name.replace(UNSAFE_FILE_CHARS, '_').trim().replace(/^_+|_+$/g, '')
  return stem || fallback
}

export function downloadFileName(name: string, ext: string, fallback = 'download'): string {
  const stem = downloadFileStem(name, fallback)
  const suffix = ext.replace(/^\./, '')
  return `${stem}.${suffix}`
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadText(text: string, fileName: string): void {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName)
}

export function downloadBytes(bytes: Uint8Array, fileName: string): void {
  downloadBlob(
    new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }),
    fileName
  )
}
