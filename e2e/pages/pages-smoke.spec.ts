import { expect, test } from '@playwright/test'
import { openSource } from '../helpers'

const SOURCE = `#define USER_SETTING 1
#include <behaviors.dtsi>
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer { bindings = <&sys_reset &studio_unlock &kp A>; };
  };
};`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
})

test('loads Demo and all local assets from the Pages subpath without API sources', async ({ page, baseURL, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const home = await request.get(baseURL!)
  expect(home.ok()).toBe(true)
  const html = await home.text()
  const base = new URL(baseURL!)
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => new URL(match[1], base))
    .filter(url => url.origin === base.origin)
  expect(assets.length).toBeGreaterThan(0)
  for (const asset of assets) {
    expect(asset.pathname.startsWith(base.pathname), asset.href).toBe(true)
    const response = await request.get(asset.href)
    expect(response.ok(), asset.href).toBe(true)
    expect(response.headers()['content-type'], asset.href).not.toContain('text/html')
  }
  await page.goto('./')
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName('Demo keyboard: Corne')
  await expect(page.locator('.keyboard-canvas .key').first()).toBeVisible()
  await page.getByTestId('source-menu-trigger').click()
  await expect(page.getByRole('radio', { name: /^Clipboard/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /^GitHub/ })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: /^Local/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Clipboard edits Unicode and preserves reset and Studio bindings without an API', async ({ page, context }) => {
  await page.goto('./')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
  await openSource(page, 'Clipboard')
  const picker = page.getByRole('dialog', { name: /Paste a \.keymap from the clipboard/ })
  await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(SOURCE)
  await picker.getByRole('button', { name: 'Load' }).click()
  await expect(page.getByRole('button', { name: '&sys_reset, layer 0', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '&studio_unlock, layer 0', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '&kp A, layer 0', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit key' })
  await dialog.getByRole('button', { name: '&uc', exact: true }).click()
  await dialog.getByRole('textbox', { name: 'Normal Unicode character or code point' }).fill('ä')
  await dialog.getByRole('textbox', { name: 'Shift Unicode character or code point' }).fill('Ä')
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.getByRole('button', { name: 'Copy .keymap' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('&uc 0xE4 0xC4')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toMatch(/&sys_reset\s+&studio_unlock/)
  expect(copied).toContain('#define USER_SETTING 1')
  expect(copied.match(/#include <behaviors\/unicode\.dtsi>/g)).toHaveLength(1)
})
