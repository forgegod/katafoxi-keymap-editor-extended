import { expect, test, type Locator, type Page } from '@playwright/test'

import { openSource, skipCoachAndOpenEditor } from './helpers'

const SOURCE = `#define USER_SETTING 1
#include <behaviors.dtsi>
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer { bindings = <&kp A &kp B>; };
  };
};`

async function load(page: Page, source = SOURCE) {
  await openSource(page, 'Clipboard')
  const picker = page.getByRole('dialog', { name: /Paste a \.keymap from the clipboard/ })
  await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
  await picker.getByRole('button', { name: 'Load' }).click()
}
async function editUnicode(page: Page) {
  await page.getByRole('button', { name: '&kp A, layer 0', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit key' })
  await dialog.getByRole('button', { name: '&uc', exact: true }).click()
  return dialog
}
async function copy(page: Page, expected: string) {
  await page.getByRole('button', { name: 'Copy .keymap' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(expected)
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('#define USER_SETTING 1')
  expect(text.match(/#include <behaviors\/unicode\.dtsi>/g)).toHaveLength(1)
  return text
}

test.beforeEach(async ({ page, context }) => {
  await skipCoachAndOpenEditor(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
  await load(page)
})

test('Unicode picker validates scalars and copies a normal/Shift pair', async ({ page }, testInfo) => {
  const dialog = await editUnicode(page)
  const compatibility = dialog.getByRole('status', { name: 'Unicode host-layout compatibility' })
  await expect(compatibility).toContainText('Compatible English layout')
  await expect(dialog.getByText('&uc requires a compatible English layout', { exact: false })).toContainText('cannot detect, select, or modify the OS active layout')
  const normal = dialog.getByRole('textbox', { name: 'Normal Unicode character or code point' })
  await normal.fill('U+D800')
  await expect(dialog.getByRole('button', { name: 'Enter valid Unicode input' })).toBeDisabled()
  await expect(dialog.getByRole('alert')).toContainText('surrogates')
  await normal.fill('ä')
  await dialog.getByRole('textbox', { name: 'Shift Unicode character or code point' }).fill('Ä')
  await expect(dialog.getByLabel('Unicode character preview')).toHaveText('Normal: ä · Shift: Ä')
  await page.screenshot({ path: testInfo.outputPath('unicode-picker.png') })
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('button', { name: '&uc 0xE4 0xC4, layer 0', exact: true })).toBeVisible()
  await copy(page, '&uc 0xE4 0xC4')
})

test('Unicode picker selects an upstream alias', async ({ page }) => {
  const dialog = await editUnicode(page)
  await dialog.getByRole('searchbox', { name: 'Filter Unicode aliases' }).fill('UC_DE_OE')
  await dialog.locator('[data-unicode-alias="UC_DE_OE"]').click()
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await copy(page, '&uc UC_DE_OE')
})

test('Unicode picker writes an input-mode switch without changing default-mode', async ({ page }) => {
  const dialog = await editUnicode(page)
  await dialog.getByRole('button', { name: 'Input mode switch' }).click()
  await dialog.getByRole('combobox', { name: 'Unicode input mode' }).selectOption('UC_SET_LINUX')
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  const text = await copy(page, '&uc UC_SET_LINUX')
  expect(text).not.toContain('default-mode')
})

test('Unicode picker Cancel does not replace the original binding', async ({ page }) => {
  const dialog = await editUnicode(page)
  await dialog.getByRole('textbox', { name: 'Normal Unicode character or code point' }).fill('😀')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Copy .keymap' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('&kp A')
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).not.toContain('&uc')
  expect(text).not.toContain('behaviors/unicode.dtsi')
})

// Inspect before focus/click can auto-scroll. Only the main dialog scrollport
// may expose an offscreen picker control; hidden overflow is not reachability.
async function expectPickerReachable(control: Locator) {
  const measure = () => control.evaluate(element => {
    const main = element.closest('.key-editor-main') as HTMLElement
    const rect = element.getBoundingClientRect()
    const port = main.getBoundingClientRect()
    const inside = (a: DOMRect, b: DOMRect) =>
      b.left >= a.left - 0.5 && b.right <= a.right + 0.5 &&
      b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5
    const viewport = new DOMRect(0, 0, innerWidth, innerHeight)
    const text: DOMRect[] = []
    // Native input/select text is painted by Chromium, not descendant text nodes.
    if (element.tagName !== 'SELECT') {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        text.push(...range.getClientRects())
      }
    }
    const issues: string[] = []
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      const bounds = parent.getBoundingClientRect()
      for (const box of [rect, ...text]) {
        if (/hidden|clip|auto|scroll/.test(style.overflowX) &&
          (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5)) issues.push('clipped x')
        if (/hidden|clip|auto|scroll/.test(style.overflowY) &&
          (box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5)) issues.push('clipped y')
      }
    }
    return {
      name: element.getAttribute('aria-label') || element.textContent,
      ownerContained: inside(viewport, port),
      ownerScrollable: /auto|scroll/.test(getComputedStyle(main).overflowY),
      horizontalFit: rect.left >= port.left && rect.right <= port.right && main.scrollWidth <= main.clientWidth,
      textFits: text.every(box => inside(rect, box)),
      exposed: inside(viewport, rect) && text.every(box => inside(viewport, box)) && issues.length === 0,
      // Wrapped inline links have separate fragments; their union's center can
      // be empty paragraph space. Every actual fragment must remain clickable.
      hit: Array.from(element.getClientRects()).every(fragment =>
        element.contains(document.elementFromPoint(fragment.x + fragment.width / 2, fragment.y + fragment.height / 2)))
    }
  })
  const before = await measure()
  expect(before.ownerContained, 'main scrollport must fit the viewport').toBe(true)
  expect(before.ownerScrollable).toBe(true)
  expect(before.horizontalFit, 'no horizontal cropping').toBe(true)
  expect(before.textFits, 'alias text must wrap inside its button').toBe(true)
  await control.evaluate(element => element.scrollIntoView({ block: 'nearest', behavior: 'instant' }))
  const after = await measure()
  expect(after.exposed, 'full control and text must escape every clipping ancestor').toBe(true)
  expect(after.hit, `exposed control must be hit-testable: ${JSON.stringify(after)}`).toBe(true)
}

async function expectCompactControl(control: Locator, role: 'tab' | 'field' | 'alias', state = 'rest') {
  const style = await control.evaluate((element, { role, state }) => {
    const actual = getComputedStyle(element)
    const probe = document.createElement('span')
    element.parentElement!.appendChild(probe)
    probe.style.color = state === 'hover' ? 'var(--accent)' : 'var(--text)'
    probe.style.background = role === 'field' ? 'var(--surface-sunken)'
      : state === 'pressed' ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)'
    probe.style.borderColor = state === 'pressed' || state === 'hover' ? 'var(--accent)' : 'var(--border)'
    probe.style.outlineColor = 'var(--accent)'
    const expected = getComputedStyle(probe)
    const result = {
      font: actual.fontSize, family: actual.fontFamily, appFamily: getComputedStyle(document.documentElement).fontFamily,
      height: element.getBoundingClientRect().height, color: actual.color, expectedColor: expected.color,
      background: actual.backgroundColor, expectedBackground: expected.backgroundColor,
      border: actual.borderTopColor, expectedBorder: expected.borderTopColor, borderWidth: actual.borderTopWidth,
      outline: actual.outlineColor, expectedOutline: expected.outlineColor,
      outlineWidth: actual.outlineWidth, outlineStyle: actual.outlineStyle, outlineOffset: actual.outlineOffset,
      focusVisible: element.matches(':focus-visible')
    }
    probe.remove()
    return result
  }, { role, state })
  expect(style.font).toBe('12px')
  expect(style.family).toBe(style.appFamily)
  expect(style.height).toBeGreaterThanOrEqual(role === 'field' ? 24 : 22)
  expect(style.height).toBeLessThanOrEqual(role === 'alias' ? 48 : role === 'field' ? 24 : 22)
  expect(style.borderWidth).toBe('1px')
  expect(style.border).toBe(style.expectedBorder)
  expect(style.background).toBe(style.expectedBackground)
  expect(style.color).toBe(style.expectedColor)
  if (state === 'focus') {
    expect(style.focusVisible).toBe(true)
    expect(style.outline).toBe(style.expectedOutline)
    expect(style.outlineWidth).toBe('2px')
    expect(style.outlineStyle).toBe('solid')
    expect(style.outlineOffset).toBe('1px')
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 360, height: 640 }]) {
    test(`Unicode compact controls in ${theme} at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
      const dialog = await editUnicode(page)
      await page.evaluate(() => document.fonts.ready)
      const picker = dialog.getByRole('region', { name: 'Unicode picker', exact: true })
      const character = picker.getByRole('button', { name: 'Character', exact: true })
      const modeTab = picker.getByRole('button', { name: 'Input mode switch', exact: true })
      const normal = picker.getByRole('textbox', { name: 'Normal Unicode character or code point' })
      const shift = picker.getByRole('textbox', { name: 'Shift Unicode character or code point' })
      const search = picker.getByRole('searchbox', { name: 'Filter Unicode aliases' })
      const group = picker.getByRole('combobox', { name: 'Unicode alias group' })
      await page.mouse.move(0, 0)
      await expect(character).toHaveAttribute('aria-pressed', 'true')
      await expectCompactControl(character, 'tab', 'pressed')
      await expectCompactControl(modeTab, 'tab')
      for (const field of [normal, shift, search, group]) await expectCompactControl(field, 'field')
      await modeTab.hover()
      await expectCompactControl(modeTab, 'tab', 'hover')
      await page.mouse.move(0, 0)
      await character.focus()
      await page.keyboard.press('Tab')
      await expect(modeTab).toBeFocused()
      await expectCompactControl(modeTab, 'tab', 'focus')
      await page.screenshot({ path: testInfo.outputPath('compact-tabs-focus.png') })
      await page.keyboard.press('Tab') // setup instructions link
      await page.keyboard.press('Tab')
      await expect(normal).toBeFocused()
      await expectCompactControl(normal, 'field', 'focus')
      await normal.fill('U+D800')
      const disabled = dialog.getByRole('button', { name: 'Enter valid Unicode input' })
      await expect(disabled).toBeDisabled()
      expect(await disabled.evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThan(1)
      await expect(dialog.getByRole('alert')).toContainText('surrogates')
      await expectPickerReachable(dialog.getByRole('alert'))
      await page.screenshot({ path: testInfo.outputPath('compact-invalid.png') })
      await normal.fill('ä')
      await shift.fill('Ä')
      await search.fill('UC_CURR_NORTH_INDIC_RUPEE')
      await group.selectOption('Currency')
      const alias = picker.locator('[data-unicode-alias="UC_CURR_NORTH_INDIC_RUPEE"]')
      await expectPickerReachable(alias)
      await expectCompactControl(alias, 'alias')
      await alias.hover()
      await expectCompactControl(alias, 'alias', 'hover')
      await page.mouse.move(0, 0)
      await group.focus()
      await expectCompactControl(group, 'field', 'focus')
      await page.keyboard.press('Tab')
      await expect(alias).toBeFocused()
      await expectCompactControl(alias, 'alias', 'focus')
      await page.screenshot({ path: testInfo.outputPath('compact-filtered-alias-focus.png') })
      await page.keyboard.press('Space')
      await expect(dialog.locator('.binding')).toHaveText('&uc UC_CURR_NORTH_INDIC_RUPEE')
      await search.fill('no-such-unicode-alias')
      await expectPickerReachable(picker.getByText('No matching aliases. Any scalar can be entered above.'))
      await modeTab.focus()
      await page.keyboard.press('Space')
      await expect(modeTab).toHaveAttribute('aria-pressed', 'true')
      await expect(character).toHaveAttribute('aria-pressed', 'false')
      await page.mouse.move(0, 0)
      await expectCompactControl(modeTab, 'tab', 'pressed')
      const mode = picker.getByRole('combobox', { name: 'Unicode input mode' })
      await expectPickerReachable(mode)
      await expectCompactControl(mode, 'field')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(mode).toBeFocused()
      await expectCompactControl(mode, 'field', 'focus')
      await mode.selectOption('UC_SET_LINUX')
      await expect(dialog.locator('.binding')).toHaveText('&uc UC_SET_LINUX')
      await page.screenshot({ path: testInfo.outputPath('compact-mode-focus.png') })
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeFocused()
    })

    test(`Unicode single-scroll reachability in ${theme} at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
      const dialog = await editUnicode(page)
      const picker = dialog.getByRole('region', { name: 'Unicode picker', exact: true })
      await page.evaluate(() => document.fonts.ready)
      const shell = await dialog.locator('.modal-content').boundingBox()
      expect(shell!.y + shell!.height, 'modal bottom must remain inside viewport').toBeLessThanOrEqual(viewport.height)
      expect(await picker.evaluate(element => Array.from(element.querySelectorAll('*')).filter(child => {
        const style = getComputedStyle(child)
        return /auto|scroll/.test(style.overflowY) && child.scrollHeight > child.clientHeight
      }).length), 'picker must not introduce a second vertical scroll owner').toBe(0)
      const controls = picker.locator('button, input, select, a')
      expect(await controls.count()).toBeGreaterThan(100) // unfiltered catalog, not just the visible rows
      for (const control of await controls.all()) await expectPickerReachable(control)
      await page.screenshot({ path: testInfo.outputPath('compact-aliases-end.png') })
      await picker.getByRole('button', { name: 'Input mode switch', exact: true }).click()
      await expectPickerReachable(picker.getByRole('combobox', { name: 'Unicode input mode' }))
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeFocused()
    })

    test(`Unicode compatibility states remain readable in ${theme} at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
      const dialog = await editUnicode(page)
      const status = dialog.getByRole('status', { name: 'Unicode host-layout compatibility' })
      const normal = dialog.getByRole('textbox', { name: 'Normal Unicode character or code point' })
      await normal.fill('ä')

      for (const state of ['compatible', 'incompatible', 'unavailable'] as const) {
        // Synthetic editor-managed state only. This does not inspect or change
        // the OS layout, nor certify firmware or module runtime behavior.
        if (state !== 'compatible') {
          await page.evaluate(async state => {
            const modulePath = '/src/lib/editor.svelte.ts'
            const { editor } = await import(/* @vite-ignore */ modulePath)
            if (state === 'incompatible') {
              const result = await editor.setHostKeyLevel('en', 'N1', 0, '!')
              if (!result.ok) throw new Error('Could not seed incompatible English table')
            } else {
              editor.hostLegend = { ...editor.hostLegend, columns: editor.hostLegend.columns.filter((column: { language: string }) => column.language !== 'en') }
            }
          }, state)
        }
        await expect(status).toContainText(state === 'compatible' ? 'Compatible English layout' : state === 'incompatible' ? 'Incompatible English layout' : 'English layout unavailable')
        await expect(status).toHaveAttribute('aria-atomic', 'true')
        if (state !== 'compatible') await expect(status).toContainText('Warning only')
        if (state === 'incompatible') await expect(status).toContainText('N1: remapped; expected 1; found exclam')
        await expect(dialog.getByText('A national layout may remain installed.', { exact: false })).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled()
        await status.scrollIntoViewIfNeeded()
        const styles = await status.evaluate((element, warning) => {
          const style = getComputedStyle(element)
          const probe = document.createElement('span')
          element.appendChild(probe)
          probe.style.color = warning ? 'var(--warn-ink)' : 'var(--text)'
          probe.style.backgroundColor = warning ? 'var(--warn-wash)' : 'var(--surface-sunken)'
          probe.style.borderColor = warning ? 'var(--warn-border)' : 'var(--border)'
          const expected = getComputedStyle(probe)
          const result = {
            fontSize: style.fontSize,
            color: style.color, expectedColor: expected.color,
            background: style.backgroundColor, expectedBackground: expected.backgroundColor,
            border: style.borderTopColor, expectedBorder: expected.borderTopColor,
            fits: element.scrollWidth <= element.clientWidth,
            theme: document.documentElement.dataset.colorScheme
          }
          probe.remove()
          return result
        }, state !== 'compatible')
        expect(styles.theme).toBe(theme)
        expect(styles.fontSize).toBe('12px')
        expect(styles.color).toBe(styles.expectedColor)
        expect(styles.background).toBe(styles.expectedBackground)
        expect(styles.border).toBe(styles.expectedBorder)
        expect(styles.fits).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`unicode-${state}-${theme}-${viewport.width}.png`) })
      }
      await normal.fill('U+D800')
      await expect(dialog.getByRole('button', { name: 'Enter valid Unicode input' })).toBeDisabled()
      await normal.fill('€')
      const apply = dialog.getByRole('button', { name: 'Apply', exact: true })
      await apply.focus()
      await expect(apply).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeFocused()
    })
  }
}
