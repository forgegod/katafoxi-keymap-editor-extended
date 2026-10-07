import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { KeyBindingNode } from '@keymap-editor/keymap-core'
import ZmkLegend from './ZmkLegend.svelte'

describe('ZmkLegend', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
  })

  function render(
    binding: KeyBindingNode,
    props: { raw?: boolean; hit?: 'none' | 'combo' | 'hold' } = {}
  ) {
    view = mount(ZmkLegend, {
      target,
      props: { binding, ...props }
    })
    flushSync()
    return target
  }

  it('compacts &bt to a short command legend', () => {
    render({ value: '&bt', params: [{ value: 'BT_CLR', params: [] }] })
    const row = target.querySelector('.zmk-row')
    expect(row?.textContent?.trim()).toBe('&bt CLR')
    expect(row?.querySelector('.zmk-beh')).toBeNull()
    expect(row?.querySelector('.params')).toBeNull()
  })

  it('compacts &bt BT_SEL with an index', () => {
    render({
      value: '&bt',
      params: [
        { value: 'BT_SEL', params: [] },
        { value: 1, params: [] }
      ]
    })
    expect(target.querySelector('.zmk-row')?.textContent?.trim()).toBe('&bt SEL1')
  })

  it('compacts &out to a short USB/BLE legend', () => {
    render({ value: '&out', params: [{ value: 'OUT_USB', params: [] }] })
    expect(target.querySelector('.zmk-row')?.textContent?.trim()).toBe('&out USB')
  })

  it('hides the &kp behaviour token and shows the key param', () => {
    render({ value: '&kp', params: [{ value: 'A', params: [] }] })
    expect(target.querySelector('.zmk-beh')).toBeNull()
    expect(target.querySelector('.params .code')?.textContent?.trim()).toBe('A')
  })

  it('shows a corner behaviour token for &mo', () => {
    render({ value: '&mo', params: [{ value: 1, params: [] }] })
    expect(target.querySelector('.zmk-beh')?.textContent).toBe('&mo')
    expect(target.querySelector('.params .code')?.textContent?.trim()).toBe('1')
  })

  it('compacts &rgblayer to L{n} plus a color swatch', () => {
    render({
      value: '&rgblayer',
      params: [
        { value: 1, params: [] },
        {
          value: 'RGB_COLOR_HSB',
          params: [
            { value: 40, params: [] },
            { value: 100, params: [] },
            { value: 200, params: [] }
          ]
        }
      ]
    })
    expect(target.querySelector('.zmk-beh')).toBeNull()
    expect(target.querySelector('.params')).toBeNull()
    expect(target.textContent).not.toContain('RGB_COLOR_HSB')
    expect(target.querySelector('.zmk-rgblayer .code')?.textContent?.trim()).toBe('L1')
    const swatch = target.querySelector('.rgb-swatch') as HTMLElement | null
    expect(swatch).toBeInstanceOf(HTMLElement)
    expect(swatch?.getAttribute('style') ?? '').toMatch(/hsl/i)
  })

  it('centers a parameterless behaviour such as &caps_word', () => {
    render({ value: '&caps_word', params: [] })
    expect(target.querySelector('.zmk-beh')?.textContent).toBe('&caps_word')
  })

  it('marks hold-tap params without showing the &mt token', () => {
    render({
      value: '&mt',
      params: [
        { value: 'LCTRL', params: [] },
        { value: 'A', params: [] }
      ]
    })
    expect(target.querySelector('.zmk-beh')).toBeNull()
    expect(target.querySelector('.param[data-slot="hold"]')?.textContent).toMatch(/LCTRL|⌃/)
    expect(target.querySelector('.param[data-slot="tap"]')?.textContent).toContain('A')
  })

  it('applies the raw class used by layer0Raw stack rows', () => {
    render({ value: '&kp', params: [{ value: 'A', params: [] }] }, { raw: true })
    expect(target.querySelector('.zmk-row')?.classList.contains('zmk-raw')).toBe(true)
  })

  it('highlights the row when the hover hit is combo', () => {
    render({ value: '&mo', params: [{ value: 1, params: [] }] }, { hit: 'combo' })
    expect(target.querySelector('.zmk-row')?.classList.contains('legend-hit')).toBe(true)
  })
})
