import type { KeyBindingNode } from './types.js'
import type { StudioBehaviorBinding } from './studio-rpc-session.js'
import { UNICODE_ALIASES, UNICODE_MODES, unicodeCodePoint } from './unicode.js'

/**
 * Expand source &uc parameters only; null means unsupported or invalid input.
 * This does not resolve a behavior ID, accept metadata or authorize an RPC send.
 */
export function expandStudioUnicodeBinding(
  binding: KeyBindingNode
): Pick<StudioBehaviorBinding, 'param1' | 'param2'> | null {
  if (binding.value !== '&uc' || binding.params.some(param => param.params.length > 0)) return null
  if (binding.params.length === 1) {
    const alias = UNICODE_ALIASES.find(row => row.code === binding.params[0].value)
    if (alias) return { param1: alias.normal, param2: alias.shift }
    const mode = UNICODE_MODES.find(row => row.code === binding.params[0].value)
    return mode ? { param1: 0xffffff, param2: mode.value } : null
  }
  if (binding.params.length !== 2) return null
  // Source cells are numeric literals, not the picker's glyph/U+ input syntax.
  if (binding.params.some(({ value }) =>
    typeof value === 'string' && !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))) return null
  const param1 = unicodeCodePoint(binding.params[0].value)
  const param2 = unicodeCodePoint(binding.params[1].value)
  return param1 !== null && param2 !== null ? { param1, param2 } : null
}
