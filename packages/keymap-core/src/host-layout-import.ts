/**
 * Import a user host layout from an xkb symbols file.
 * Includes resolve against vendored modules (`us`, `ru`, `latin`, …).
 */

import { HOST_LANGUAGES } from './host-languages.js'
import { hostLayoutFromSymbols, type HostLayout } from './host-layout.js'
import { SYSTEM_LATIN_SYMBOLS } from './system-latin-symbols.js'
import { SYSTEM_US_XKB_SYMBOLS } from './system-us-xkb-symbols.js'
import { parseXkbSymbolsSection } from './xkb-symbols.js'

export interface HostLayoutFromXkbOptions {
  fileName: string
}

function vendoredXkbFiles(): Record<string, string> {
  const files: Record<string, string> = {
    latin: SYSTEM_LATIN_SYMBOLS,
    us: SYSTEM_US_XKB_SYMBOLS
  }
  for (const language of HOST_LANGUAGES) {
    if (files[language.xkbModule] == null) files[language.xkbModule] = language.symbols
  }
  return files
}

function fileIdFromName(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName
  return base.replace(/\.(xkb|txt)$/i, '') || base
}

/**
 * Parse one section. Unresolvable `include` throws and names the include.
 */
export function hostLayoutFromXkb(
  text: string,
  section: string,
  options: HostLayoutFromXkbOptions
): HostLayout {
  const files = vendoredXkbFiles()
  const fileId = fileIdFromName(options.fileName)
  parseXkbSymbolsSection(text, section, [], {
    files,
    fileId,
    strictIncludes: true
  })
  return hostLayoutFromSymbols(text, section, `xkb:${fileId}:${section}`, files)
}
