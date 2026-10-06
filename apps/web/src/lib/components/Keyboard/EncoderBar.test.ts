import { encodeKeyBinding, type KeyBindingNode, type ParsedKeymap } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../../editor.svelte.js'
import Harness from './KeyboardHarness.svelte'

// happy-dom comment nodes are not `instanceof Comment`. Svelte skips empty
// comment anchors with that check; without it, Keyboard's wrapper style is
// applied to a text node and mount throws.
const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

const trans: KeyBindingNode = { value: '&trans', params: [] }
const keyA: KeyBindingNode = { value: '&kp', params: [{ value: 'A', params: [] }] }
const keyB: KeyBindingNode = { value: '&kp', params: [{ value: 'B', params: [] }] }

function volPair(cw: string, ccw: string): KeyBindingNode {
  return {
    value: '&inc_dec_kp',
    params: [
      { value: cw, params: [] },
      { value: ccw, params: [] }
    ]
  }
}

function accessibleName(el: Element): string {
  const labelled = el.getAttribute('aria-label')
  if (labelled) return labelled.replace(/\s+/g, ' ').trim()
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function byRole(
  role: string,
  name: string | RegExp,
  root: ParentNode = document
): HTMLElement {
  const nodes =
    role === 'button'
      ? [...root.querySelectorAll('button, [role="button"]')]
      : role === 'dialog'
        ? [...root.querySelectorAll('dialog, [role="dialog"]')]
        : role === 'searchbox'
          ? [...root.querySelectorAll('input[type="search"], [role="searchbox"]')]
          : [...root.querySelectorAll(`[role="${role}"]`)]
  const match = nodes.find(el => {
    const label = accessibleName(el)
    return typeof name === 'string' ? label === name : name.test(label)
  })
  if (!(match instanceof HTMLElement)) {
    throw new Error(`missing ${role} ${String(name)}`)
  }
  return match
}

function named(label: string, root: ParentNode = document): HTMLElement {
  const match = [...root.querySelectorAll('[aria-label]')].find(
    el => el.getAttribute('aria-label') === label
  )
  if (!(match instanceof HTMLElement)) {
    throw new Error(`missing named control ${label}`)
  }
  return match
}

function keymapWithSensors(sensorBindings: KeyBindingNode[][]): ParsedKeymap {
  return {
    layer_names: ['Base', 'Raise', 'Adjust'],
    layers: [
      [keyA, keyB],
      [trans, trans],
      [trans, trans]
    ],
    sensorBindings
  }
}

describe('EncoderBar', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    editor.resetForTests()
    target = document.createElement('div')
    document.body.appendChild(target)
    const modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    target.appendChild(modalRoot)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    editor.resetForTests()
    vi.restoreAllMocks()
  })

  function open(sensorBindings: KeyBindingNode[][]) {
    view = mount(Harness, {
      target,
      props: { initialKeymap: keymapWithSensors(sensorBindings) }
    })
    flushSync()
  }

  function hoverLayer(layer: number) {
    editor.legendHover = { kind: 'layer', layer }
    flushSync()
  }

  function editDialog(): HTMLElement {
    return byRole('dialog', 'Edit key')
  }

  function pickCode(code: string) {
    const dialog = editDialog()
    const filter = dialog.querySelector('input[type="search"]')
    if (filter instanceof HTMLInputElement) {
      filter.value = code
      filter.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
    }
    const choice = [...dialog.querySelectorAll('button')].find(el => {
      const title = el.getAttribute('title') ?? ''
      const label = accessibleName(el)
      return title.startsWith(code) || label === code || label.includes(code)
    })
    if (!(choice instanceof HTMLButtonElement)) {
      throw new Error(`missing key choice ${code}`)
    }
    choice.click()
    flushSync()
  }

  function applyEdit() {
    byRole('button', 'Apply', editDialog()).click()
    flushSync()
  }

  it('updates the hovered layer turn when C_VOL_UP is applied', () => {
    open([[volPair('C_VOL_UP', 'C_VOL_DN')], [], [volPair('C_MUTE', 'C_VOL_DN')]])
    const spy = vi.spyOn(editor, 'updateSensorBinding')
    hoverLayer(2)

    byRole('button', 'Clockwise 🔇').click()
    flushSync()
    expect(editDialog()).toBeInstanceOf(HTMLElement)

    pickCode('C_VOL_UP')
    applyEdit()

    expect(document.querySelector('[role="dialog"][aria-label="Edit key"]')).toBeNull()
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toBe(2)
    expect(spy.mock.calls[0][1]).toBe(0)
    expect(encodeKeyBinding(spy.mock.calls[0][2] as KeyBindingNode)).toBe(
      '&inc_dec_kp C_VOL_UP C_VOL_DN'
    )
    expect(encodeKeyBinding(editor.draftKeymap!.sensorBindings![2][0])).toBe(
      '&inc_dec_kp C_VOL_UP C_VOL_DN'
    )
    expect(encodeKeyBinding(editor.draftKeymap!.sensorBindings![0][0])).toBe(
      '&inc_dec_kp C_VOL_UP C_VOL_DN'
    )
  })

  it('still edits an unknown encoder behaviour via a synthetic catalog entry', () => {
    const unknown: KeyBindingNode = {
      value: '&not_a_catalog_enc',
      params: [
        { value: 'C_MUTE', params: [] },
        { value: 'C_VOL_DN', params: [] }
      ]
    }
    open([[unknown], [], []])
    const spy = vi.spyOn(editor, 'updateSensorBinding')
    hoverLayer(0)

    byRole('button', 'Clockwise 🔇').click()
    flushSync()
    expect(editDialog()).toBeInstanceOf(HTMLElement)
    expect(editDialog().textContent).toContain('&not_a_catalog_enc')

    pickCode('C_VOL_UP')
    applyEdit()

    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toBe(0)
    expect(spy.mock.calls[0][1]).toBe(0)
    expect(encodeKeyBinding(spy.mock.calls[0][2] as KeyBindingNode)).toBe(
      '&not_a_catalog_enc C_VOL_UP C_VOL_DN'
    )
  })

  it('does not open the editor for a turn with no parameters', () => {
    open([[{ value: '&inc_dec_kp', params: [] }], [], []])
    hoverLayer(0)

    named('Encoder').click()
    flushSync()
    expect(document.querySelector('[role="dialog"][aria-label="Edit key"]')).toBeNull()
    expect(named('Encoders').textContent).toContain('&inc_dec_kp')
  })

  it('shows that a hovered layer has no encoder', () => {
    open([[volPair('C_VOL_UP', 'C_VOL_DN')], [], [volPair('C_MUTE', 'C_VOL_DN')]])
    hoverLayer(1)

    expect(named('Encoders').textContent).toContain('No encoder on this layer.')
    expect(document.querySelector('[role="dialog"][aria-label="Edit key"]')).toBeNull()
  })
})
