import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inferRectangularLayout, parseDtsKeymap, parseKeymap } from '@keymap-editor/keymap-core'
import { editor } from '../editor.svelte'
import LayoutDiscovery from './LayoutDiscovery.svelte'

const code = '/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };'
const catalog = JSON.stringify({ version: 'test', entries: [{ id: 'test', board: 'synthetic', revision: '1', stockIncludes: [],
  metadata: '/ { t: transform { compatible = "zmk,matrix-transform"; rows = <1>; columns = <1>; map = <RC(0,0)>; }; };',
  attribution: { url: 'https://example.invalid/synthetic', commit: 'a'.repeat(40), license: 'MIT', notice: 'Synthetic', path: 'test.dtsi' }
}] })
let target: HTMLDivElement
let view: ReturnType<typeof mount>
const button = (name: string) => [...target.querySelectorAll('button')].find(item => item.textContent?.trim() === name)!
const input = (selector: string, value: string, event = 'input') => {
  const field = target.querySelector(selector) as HTMLInputElement
  field.value = value
  field.dispatchEvent(new Event(event, { bubbles: true }))
  flushSync()
}
beforeEach(() => {
  editor.resetForTests()
  editor.source = 'clipboard'
  editor.clipboardOriginalSource = code
  editor.layoutDiscoveryInput = { code, explicit: false }
  editor.draftKeymap = parseKeymap(parseDtsKeymap(code))
  editor.baselineKeymap = editor.draftKeymap
  editor.layout = inferRectangularLayout(1)
  editor.baselineLayout = inferRectangularLayout(1)
  target = document.createElement('div')
  document.body.append(target)
  view = mount(LayoutDiscovery, { target })
  flushSync()
  button('Layout discovery').click()
  flushSync()
})
afterEach(() => { unmount(view); target.remove(); editor.resetForTests() })

it('invalid catalog reports an actionable error without authorizing acceptance or export', async () => {
  input('textarea', '{bad json')
  button('Load catalog').click()
  await vi.waitFor(() => expect(target.querySelector('[role="alert"]')?.textContent).toContain('Invalid catalog'))
  expect(button('Accept layout')).toBeUndefined()
  expect(button('Export layout JSON')).toBeUndefined()
  expect(editor.layout).toEqual(inferRectangularLayout(1))
})

it('stale Apply stays open and preserves the live document after a valid preview', async () => {
  input('textarea', catalog)
  button('Load catalog').click()
  await vi.waitFor(() => expect(target.querySelector('select')).toBeTruthy())
  const select = target.querySelector('select')!
  select.value = 'test'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  flushSync()
  button('Preview layout').click()
  flushSync()
  expect(target.textContent).toContain('Inferred electrical arrangement')
  const checkbox = target.querySelector('input[type="checkbox"]') as HTMLInputElement
  checkbox.click()
  flushSync()
  expect(button('Accept layout').disabled).toBe(false)
  editor._selectGeneration++
  button('Accept layout').click()
  flushSync()
  expect(target.querySelector('[role="alert"]')?.textContent).toContain('Document or source changed')
  expect(target.querySelector('[role="dialog"]')).toBeTruthy()
  expect(editor.layout).toEqual(inferRectangularLayout(1))
})
