import { expect, test } from '@playwright/test'
import { openSource } from '../helpers'

const expectGitHub = process.env.PAGES_EXPECT_GITHUB === 'true'

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

test('loads Demo and all local assets from the public base path with configured sources', async ({ page, baseURL, request }) => {
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
  await expect(page.getByRole('radio', { name: /^GitHub/ })).toHaveCount(expectGitHub ? 1 : 0)
  await expect(page.getByRole('radio', { name: /^Local/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('GitHub requires a session and starts same-origin OAuth with secure cookies', async ({ request, baseURL }) => {
  test.skip(!expectGitHub, 'GitHub is deliberately disabled on static Pages')
  const installation = await request.get(new URL('github/installation', baseURL!).href)
  expect(installation.status()).toBe(401)
  const authorize = await request.get(new URL('github/authorize', baseURL!).href, { maxRedirects: 0 })
  expect(authorize.status()).toBe(302)
  const location = new URL(authorize.headers()['location'])
  expect(location.origin).toBe('https://github.com')
  expect(location.pathname).toBe('/login/oauth/authorize')
  expect(location.searchParams.get('redirect_uri')).toBe(new URL('github/authorize', baseURL!).href)
  expect(Boolean(location.searchParams.get('client_id'))).toBe(true)
  expect(Boolean(location.searchParams.get('state'))).toBe(true)
  const cookies = authorize.headers()['set-cookie'] || ''
  expect(cookies.includes('HttpOnly')).toBe(true)
  expect(cookies.includes('Secure')).toBe(true)
  expect(cookies.includes('SameSite=Lax')).toBe(true)
})

test('installation callback without state starts fresh OAuth and never creates an unauthenticated session', async ({ request, baseURL }) => {
  test.skip(!expectGitHub, 'GitHub is deliberately disabled on static Pages')
  const path = 'github/authorize?code=smoke-unverified-install-code&installation_id=123&setup_action=install'
  const returned = await request.get(new URL(path, baseURL!).href, { maxRedirects: 0 })
  expect(returned.status()).toBe(302)
  const location = new URL(returned.headers()['location'])
  expect(location.origin).toBe('https://github.com')
  expect(location.pathname).toBe('/login/oauth/authorize')
  expect(Boolean(location.searchParams.get('state'))).toBe(true)
  expect(location.searchParams.has('code')).toBe(false)
  expect(location.searchParams.has('installation_id')).toBe(false)
  const protectedRoute = await request.get(new URL('github/installation', baseURL!).href)
  expect(protectedRoute.status()).toBe(401)
  const invalid = await request.get(new URL(`${path}&state=mismatched`, baseURL!).href, { maxRedirects: 0 })
  expect(invalid.status()).toBe(401)
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
