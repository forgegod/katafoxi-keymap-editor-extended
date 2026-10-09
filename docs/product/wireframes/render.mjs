import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const root = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
assert(Array.isArray(manifest.screens) && manifest.screens.length > 0, 'Missing screen inventory')
const browser = await chromium.launch()
try {
  await mkdir(path.join(root, 'exports'), { recursive: true })
  for (const screen of manifest.screens) {
    assert(/^CAP-\d+$/.test(screen.id), 'Invalid capability ID')
    assert(new RegExp(`^html/${screen.id}-[a-z0-9-]+\\.html$`).test(screen.html), 'Invalid HTML path')
    assert(new RegExp(`^exports/${screen.id}-[a-z0-9-]+\\.png$`).test(screen.png), 'Invalid PNG path')
    assert.equal(path.basename(screen.html, '.html'), path.basename(screen.png, '.png'))
    assert([screen.viewport?.width, screen.viewport?.height].every(n => Number.isInteger(n) && n > 0), 'Invalid viewport')
    const page = await browser.newPage({ viewport: screen.viewport, deviceScaleFactor: 1, colorScheme: 'dark' })
    try {
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route(/^https?:/, route => route.abort())
      await page.goto(pathToFileURL(path.join(root, screen.html)).href)
      await page.evaluate(() => document.fonts.ready)
      assert.equal(await page.locator('h1').textContent(), screen.title)
      assert(await page.locator('h1').isVisible(), 'Heading is not visible')
      const layout = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight
      }))
      assert(layout.width <= layout.viewportWidth, `${screen.id}: horizontal overflow`)
      assert(layout.height <= layout.viewportHeight, `${screen.id}: vertical overflow; increase manifest viewport or simplify screen`)
      assert.deepEqual(errors, [], 'Browser rendering errors')
      await page.screenshot({ path: path.join(root, screen.png), fullPage: false, animations: 'disabled' })
      console.log(`Rendered ${screen.id}: ${screen.viewport.width}x${screen.viewport.height}; heading visible, no overflow or page errors.`)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
}
