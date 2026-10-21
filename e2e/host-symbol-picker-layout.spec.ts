import { expect, test, type Page } from '@playwright/test'
import { openSource } from './helpers'

const SOURCE = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };`

async function loadClipboard(page: Page) {
  await openSource(page, 'Clipboard')
  const picker = page.getByRole('dialog').filter({
    has: page.getByRole('textbox', { name: /Paste your board \.keymap/ })
  })
  await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(SOURCE)
  await picker.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(picker).toBeHidden()
}

test('Alt-click keeps the Host symbol catalog clear of the locked decode card on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
  await page.goto('/')
  await loadClipboard(page)

  await page.getByRole('button', { name: '&kp A, layer 0', exact: true }).click({ modifiers: ['Alt'] })
  const catalog = page.getByRole('dialog', { name: 'Host symbol catalog', exact: true })
  const card = page.locator('.legend-decode.session')
  await expect(catalog).toBeVisible()
  await expect(card).toBeVisible()

  const layout = await page.evaluate(() => {
    const catalogBox = document.querySelector<HTMLElement>('.host-symbol-picker')?.getBoundingClientRect()
    const cardBox = document.querySelector<HTMLElement>('.legend-decode.session')?.getBoundingClientRect()
    if (!catalogBox || !cardBox) return null
    const overlaps =
      catalogBox.left < cardBox.right &&
      catalogBox.right > cardBox.left &&
      catalogBox.top < cardBox.bottom &&
      catalogBox.bottom > cardBox.top
    return {
      catalog: { left: catalogBox.left, top: catalogBox.top, right: catalogBox.right, bottom: catalogBox.bottom },
      card: { left: cardBox.left, top: cardBox.top, right: cardBox.right, bottom: cardBox.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      overlaps
    }
  })

  expect(layout).not.toBeNull()
  expect(layout, `host edit layout: ${JSON.stringify(layout)}`).toMatchObject({ overlaps: false })
  expect(layout!.catalog.left).toBeGreaterThanOrEqual(8)
  expect(layout!.catalog.top).toBeGreaterThanOrEqual(8)
  expect(layout!.catalog.right).toBeLessThanOrEqual(layout!.viewport.width - 8)
  expect(layout!.catalog.bottom).toBeLessThanOrEqual(layout!.viewport.height - 8)
  expect(layout!.card.left).toBeGreaterThanOrEqual(0)
  expect(layout!.card.top).toBeGreaterThanOrEqual(0)
  expect(layout!.card.right).toBeLessThanOrEqual(layout!.viewport.width)
  expect(layout!.card.bottom).toBeLessThanOrEqual(layout!.viewport.height)
})
