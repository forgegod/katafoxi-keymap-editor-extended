import { expect, test, type Page } from '@playwright/test'

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

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 360, height: 640 }]) {
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
