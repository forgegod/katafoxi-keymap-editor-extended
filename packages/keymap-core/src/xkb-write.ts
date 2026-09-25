/**
 * Write one self-contained `xkb_symbols` section from a host layout.
 * Keys follow `HOST_KEY_IDS` order. Missing keys are omitted. Each key
 * has four keysym names; absent levels are `NoSymbol`.
 */

import { HOST_KEY_IDS } from './host-key-id.js'
import type { HostLayout } from './host-layout.js'

export interface HostLayoutXkbSectionOptions {
  section: string
  name: string
}

function quoteXkb(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function keysymName(name: string): string {
  return name || 'NoSymbol'
}

/** One standalone section with no `include`. */
export function hostLayoutToXkbSection(
  layout: HostLayout,
  options: HostLayoutXkbSectionOptions
): string {
  const lines = [
    `xkb_symbols ${quoteXkb(options.section)} {`,
    `    name[Group1]= ${quoteXkb(options.name)};`,
    ''
  ]
  for (const host of HOST_KEY_IDS) {
    const levels = layout.byZmk.get(host.zmk)
    if (!levels) continue
    const keysyms = levels.keysyms.map(keysymName).join(', ')
    lines.push(`    key <${host.xkb}> { [ ${keysyms} ] };`)
  }
  lines.push('};')
  return `${lines.join('\n')}\n`
}
