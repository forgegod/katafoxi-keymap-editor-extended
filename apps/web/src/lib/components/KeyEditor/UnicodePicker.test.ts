import { encodeKeyBinding, hostLayout, parseKeyBinding, unicodeHostLayoutCompatibility, withHostKey, type KeyBindingNode, type UnicodeHostLayoutCompatibility } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UnicodePicker from './UnicodePicker.svelte'

let target: HTMLDivElement
let view: ReturnType<typeof mount> | undefined
const change = vi.fn<(binding: KeyBindingNode | null) => void>()

function open(code = '&uc', compatibility?: UnicodeHostLayoutCompatibility) {
  change.mockClear()
  target = document.createElement('div')
  document.body.appendChild(target)
  view = mount(UnicodePicker, { target, props: { value: parseKeyBinding(code), compatibility, onChange: change } })
  flushSync()
}
function input(label: string, value: string) {
  const field = target.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}
function lastBinding() {
  const binding = change.mock.calls.at(-1)?.[0]
  return binding ? encodeKeyBinding(binding) : null
}

afterEach(() => {
  if (view) unmount(view)
  view = undefined
  target?.remove()
})

describe('UnicodePicker', () => {
  it.each([unicodeHostLayoutCompatibility(undefined), undefined])('renders unavailable input as warning-only and preserves opaque bindings', compatibility => {
    open('&uc UC_EXTERNAL_NAME', compatibility)
    const status = target.querySelector('[role="status"][aria-label="Unicode host-layout compatibility"]')!
    expect(status.textContent).toContain('English layout unavailable')
    expect(status.textContent).toContain('no available table to check')
    expect(status.textContent).toContain('Warning only')
    expect(lastBinding()).toBe('&uc UC_EXTERNAL_NAME')
    input('Normal Unicode character or code point', '😀')
    expect(lastBinding()).toBe('&uc 0x1F600 0')
  })

  it('renders immutable incompatible diagnostics as an accessible warning without blocking editing', () => {
    const layout = withHostKey(hostLayout('system-us')!, 'N1', 0, 'exclam')!
    const byZmk = new Map(layout.byZmk)
    byZmk.delete('ENTER')
    const compatibility = unicodeHostLayoutCompatibility({ ...layout, byZmk })
    compatibility.issues.forEach(Object.freeze)
    Object.freeze(compatibility.issues)
    Object.freeze(compatibility)
    const before = JSON.stringify(compatibility)
    open('&uc UC_DE_AE', compatibility)
    const status = target.querySelector('[role="status"][aria-label="Unicode host-layout compatibility"]')!
    expect(status.getAttribute('aria-atomic')).toBe('true')
    expect(status.textContent).toContain('Incompatible English layout')
    expect(status.textContent).toContain('N1: remapped; expected 1; found exclam')
    expect(status.textContent).toContain('ENTER: missing; expected Return; found no mapping')
    expect(status.textContent).toContain('Warning only')
    expect(target.textContent).toContain('&uc requires a compatible English layout to be active in the OS while used')
    expect(target.textContent).toContain('A national layout may remain installed')
    expect(target.textContent).toContain('cannot detect, select, or modify the OS active layout')
    expect(lastBinding()).toBe('&uc UC_DE_AE')
    input('Normal Unicode character or code point', '€')
    expect(lastBinding()).toBe('&uc 0x20AC 0xC4')
    target.querySelector<HTMLButtonElement>('[data-unicode-kind="mode"]')!.click()
    flushSync()
    expect(lastBinding()).toBe('&uc UC_SET_WIN_COMPOSE')
    expect(status.textContent).toContain('Incompatible English layout')
    expect(JSON.stringify(compatibility)).toBe(before)
  })

  it('creates a normal and Shift character pair with glyph previews', () => {
    open()
    input('Normal Unicode character or code point', 'ä')
    input('Shift Unicode character or code point', 'Ä')
    expect(lastBinding()).toBe('&uc 0xE4 0xC4')
    expect(target.textContent).toContain('ä')
    expect(target.textContent).toContain('Ä')
  })

  it('blocks surrogate and out-of-range input without clamping', () => {
    open('&uc 0xE4 0')
    input('Normal Unicode character or code point', 'U+D800')
    expect(lastBinding()).toBeNull()
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('surrogates')
  })

  it('selects an upstream alias without rewriting it into numeric cells', () => {
    open()
    input('Filter Unicode aliases', 'UC_DE_OE')
    target.querySelector<HTMLButtonElement>('[data-unicode-alias="UC_DE_OE"]')!.click()
    flushSync()
    expect(lastBinding()).toBe('&uc UC_DE_OE')
  })

  it('creates an input mode switch rather than treating the sentinel as a glyph', () => {
    open()
    target.querySelector<HTMLButtonElement>('[data-unicode-kind="mode"]')!.click()
    flushSync()
    const select = target.querySelector<HTMLSelectElement>('select[aria-label="Unicode input mode"]')!
    select.value = 'UC_SET_LINUX'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    expect(lastBinding()).toBe('&uc UC_SET_LINUX')
  })

  it('preserves unresolved expressions unless the user explicitly replaces them', () => {
    open('&uc UC_EXTERNAL_NAME')
    expect(lastBinding()).toBe('&uc UC_EXTERNAL_NAME')
    expect(target.textContent).toContain('kept unchanged')
  })
})
