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

async function openNarrowClipboard(page: Page) {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
  await page.goto('/')
  await loadClipboard(page)
}

async function expectViewportContainedPanel(page: Page, name: 'Macros' | 'Behaviors') {
  await page.getByRole('button', { name, exact: true }).click()
  const dialog = page.getByRole('dialog', { name, exact: true })
  const panel = dialog.locator('.macro-panel')
  await expect(panel).toBeVisible()
  const layout = await panel.evaluate(element => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: style.overflowY
    }
  })
  expect(layout, `${name} panel layout: ${JSON.stringify(layout)}`).toMatchObject({ overflowY: 'auto' })
  expect(layout.left).toBeGreaterThanOrEqual(8)
  expect(layout.top).toBeGreaterThanOrEqual(8)
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth - 8)
  expect(layout.bottom).toBeLessThanOrEqual(layout.viewportHeight - 8)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
}

test('Macro and Behavior panels stay inside a narrow viewport and own vertical scroll', async ({ page }) => {
  await openNarrowClipboard(page)
  await expectViewportContainedPanel(page, 'Macros')
  await expectViewportContainedPanel(page, 'Behaviors')
})

test('Macro and Behavior panels stay inside a desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
  await page.goto('/')
  await loadClipboard(page)
  await expectViewportContainedPanel(page, 'Macros')
  await expectViewportContainedPanel(page, 'Behaviors')
})

test('parameterized behavior chips wrap without horizontal clipping on a narrow viewport', async ({ page }) => {
  await openNarrowClipboard(page)
  await page.getByRole('button', { name: '&kp A, layer 0', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit key', exact: true })
  const parameterized = dialog.locator('[data-behaviour-group="params"]')
  await expect(parameterized).toBeVisible()
  const layout = await parameterized.evaluate(element => {
    const box = element.getBoundingClientRect()
    const chips = [...element.querySelectorAll<HTMLElement>('.key-editor-chip')]
    const rows = new Set(chips.map(chip => Math.round(chip.getBoundingClientRect().top)))
    return {
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      right: box.right,
      viewportWidth: window.innerWidth,
      rows: rows.size,
      chipsFit: chips.every(chip => {
        const rect = chip.getBoundingClientRect()
        return rect.left >= box.left && rect.right <= box.right
      })
    }
  })
  expect(layout, `parameterized behavior layout: ${JSON.stringify(layout)}`).toMatchObject({ chipsFit: true })
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth - 8)
  expect(layout.rows).toBeGreaterThan(1)
})