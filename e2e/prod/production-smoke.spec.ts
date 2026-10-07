import { expect, test } from '@playwright/test'

function assetScriptSrc(html: string): string | undefined {
  const match = html.match(/src="(\/assets\/[^"]+\.js)"/)
  return match?.[1]
}

test('opens / without console errors or CSP violations and loads Demo', async ({
  page
}) => {
  const consoleErrors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  const assetScripts = new Set<string>()
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname
    if (response.request().resourceType() === 'script' && pathname.startsWith('/assets/')) {
      assetScripts.add(pathname)
    }
  })

  await page.addInitScript(() => {
    Object.defineProperty(window, '__cspViolations', {
      value: [],
      writable: true,
      configurable: true
    })
    document.addEventListener('securitypolicyviolation', event => {
      const list = (window as Window & { __cspViolations: string[] }).__cspViolations
      list.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })

  await page.goto('/')
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
    'Demo keyboard: Corne'
  )
  await expect(page.locator('.keyboard-canvas .key').first()).toBeVisible()

  const violations = await page.evaluate(
    () => (window as Window & { __cspViolations: string[] }).__cspViolations
  )
  expect(violations, `CSP violations: ${violations.join('; ')}`).toEqual([])
  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([])
  expect(
    [...assetScripts].some(pathname => /corne|keymap|info/i.test(pathname)),
    `expected a Demo lazy chunk among ${[...assetScripts].join(', ')}`
  ).toBe(true)
})

test('hashed /assets/*.js send Cache-Control with immutable', async ({ request }) => {
  const home = await request.get('/')
  expect(home.ok()).toBeTruthy()
  const src = assetScriptSrc(await home.text())
  expect(src).toBeTruthy()
  const res = await request.get(src!)
  expect(res.ok()).toBeTruthy()
  expect(res.headers()['cache-control'] ?? '').toContain('immutable')
})

test('GET /github/whatever is 404, not the SPA', async ({ request }) => {
  const res = await request.get('/github/whatever')
  expect(res.status()).toBe(404)
  const body = await res.text()
  expect(body).not.toMatch(/<!doctype html/i)
  expect(body).not.toContain('id="app-root"')
})

test('GET /some/deep/link serves the SPA index', async ({ request }) => {
  const [deep, home] = await Promise.all([
    request.get('/some/deep/link'),
    request.get('/')
  ])
  expect(deep.status()).toBe(200)
  const body = await deep.text()
  expect(body).toMatch(/<!doctype html/i)
  expect(body).toContain('id="app-root"')
  expect(body).toBe(await home.text())
})

test("GET / sends CSP frame-ancestors 'none'", async ({ request }) => {
  const res = await request.get('/')
  expect(res.ok()).toBeTruthy()
  const csp = res.headers()['content-security-policy'] ?? ''
  expect(csp).toMatch(/frame-ancestors\s+'none'/)
})
