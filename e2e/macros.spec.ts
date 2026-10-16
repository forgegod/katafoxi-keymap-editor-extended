import { expect, type Page, test } from '@playwright/test'
import { openSource } from './helpers'

// Closed stock includes, no aliases: authoring eligibility is intentionally
// narrower than the ordinary Clipboard preservation fixtures.
const SOURCE = `// User-owned preamble stays intact.
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/modifiers.h>
/ {
  keymap {
    compatible = "zmk,keymap";
    base { bindings = <&kp A &kp B>; };
  };
};`

async function loadClipboard(page: Page, source: string) {
  await openSource(page, 'Clipboard')
  const picker = page.getByRole('dialog').filter({
    has: page.getByRole('textbox', { name: /Paste your board \.keymap/ })
  })
  await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
  await picker.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(picker).toBeHidden()
}

async function copyKeymap(page: Page) {
  await page.getByRole('button', { name: 'Copy .keymap', exact: true }).click()
  const exported = page.getByRole('dialog', { name: 'Exported keymap' })
  await expect(exported.getByRole('status')).toContainText('Copied to the system clipboard')
  const source = await page.evaluate(() => navigator.clipboard.readText())
  await exported.getByRole('button', { name: 'Close', exact: true }).click()
  return source
}

test('Clipboard macros create/use/edit/export/reload with cancel and undo/redo', async ({ context, page }) => {
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
  await page.goto('/')
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName('Demo keyboard: Corne')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin
  })
  await loadClipboard(page, SOURCE)

  const panel = page.getByRole('dialog', { name: 'Macros', exact: true })
  const open = () => page.getByRole('button', { name: 'Macros', exact: true }).click()
  const close = () => panel.getByRole('button', { name: 'Close', exact: true }).click()
  const preview = panel.getByLabel('Macro source preview', { exact: true })
  const originalKey = page.getByRole('button', { name: '&kp A, layer 0', exact: true })
  const macroKey = page.getByRole('button', { name: '&greeting, layer 0', exact: true })

  await open()
  await panel.getByRole('button', { name: 'New macro', exact: true }).press('Enter')
  await panel.getByLabel('Macro label', { exact: true }).fill('greeting')
  await panel.getByLabel('Tap time (ms)', { exact: true }).fill('0')
  await panel.getByLabel('Wait time (ms)', { exact: true }).fill('40')
  await panel.getByRole('button', { name: 'Preview changes', exact: true }).press('Enter')
  await expect(preview).toContainText('greeting: greeting')
  await expect(preview).toContainText('tap-ms = <0>')
  await panel.getByRole('button', { name: 'Confirm changes', exact: true }).press('Enter')
  await expect(panel.getByRole('button', { name: 'Edit &greeting', exact: true })).toBeEnabled()
  await close()

  // Creation is a single history step, not just a visible list entry.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await open()
  await expect(panel.getByRole('button', { name: 'Edit &greeting', exact: true })).toHaveCount(0)
  await close()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await open()
  await panel.getByRole('button', { name: 'Use &greeting', exact: true }).click()
  await panel.getByRole('button', { name: 'Preview binding', exact: true }).click()
  await expect(panel.getByLabel('Binding replacement')).toHaveText('&kp A → &greeting')
  await expect(originalKey).toBeVisible()
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(originalKey).toBeVisible()
  await panel.getByRole('button', { name: 'Use &greeting', exact: true }).click()
  await panel.getByRole('button', { name: 'Preview binding', exact: true }).click()
  await panel.getByRole('button', { name: 'Confirm changes', exact: true }).click()
  await expect(macroKey).toBeVisible()
  await panel.getByRole('button', { name: 'Delete &greeting', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('incoming references')
  await expect(preview).toHaveCount(0)

  await panel.getByRole('button', { name: 'Edit &greeting', exact: true }).click()
  await panel.getByLabel('Step 1 binding', { exact: true }).fill('&kp C')
  await panel.getByLabel('Wait time (ms)', { exact: true }).fill('0')
  await panel.getByRole('button', { name: 'Preview changes', exact: true }).click()
  await expect(preview).toContainText('&kp C')
  await panel.getByRole('button', { name: 'Confirm changes', exact: true }).click()
  await close()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await open()
  await panel.getByRole('button', { name: 'Edit &greeting', exact: true }).click()
  await expect(panel.getByLabel('Step 1 binding', { exact: true })).toHaveValue('&kp A')
  await expect(panel.getByLabel('Wait time (ms)', { exact: true })).toHaveValue('40')
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await close()
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()

  const copied = await copyKeymap(page)
  expect(copied.slice(0, copied.indexOf('/ {'))).toBe(SOURCE.slice(0, SOURCE.indexOf('/ {')))
  expect(copied).toMatch(/base\s*\{\s*bindings\s*=\s*<\s*&greeting\s+&kp B\s*>/)
  expect(copied).toContain('bindings = <&kp C>')
  expect(copied).toContain('tap-ms = <0>')
  expect(copied).toContain('wait-ms = <0>')

  // Reload the exported artifact through the real picker, not editor internals.
  await loadClipboard(page, copied)
  await expect(macroKey).toBeVisible()
  await open()
  await panel.getByRole('button', { name: 'Edit &greeting', exact: true }).click()
  await expect(panel.getByLabel('Step 1 binding', { exact: true })).toHaveValue('&kp C')
  await expect(panel.getByLabel('Tap time (ms)', { exact: true })).toHaveValue('0')
  await expect(panel.getByLabel('Wait time (ms)', { exact: true })).toHaveValue('0')
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await close()
  expect(await copyKeymap(page)).toBe(copied)
})
