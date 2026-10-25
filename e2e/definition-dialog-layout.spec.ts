import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSource } from './helpers'

const SOURCE = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };`

async function loadClipboard(page: Page, source = SOURCE) {
  await openSource(page, 'Clipboard')
  const picker = page.getByRole('dialog').filter({
    has: page.getByRole('textbox', { name: /Paste your board \.keymap/ })
  })
  await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
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

// Measure before focus/click can auto-scroll. Only the owning main scrollport
// may expose a clipped chip; check both the button and its actual text range.
async function expectHelpReachable(chip: Locator) {
  const measure = () => chip.evaluate(element => {
    const main = element.closest('.key-editor-main')!
    const rect = element.getBoundingClientRect()
    const port = main.getBoundingClientRect()
    const text = document.createRange()
    text.selectNodeContents(element)
    const boxes = [rect, ...text.getClientRects()]
    const inside = (box: DOMRect, bounds: DOMRect) => box.left >= bounds.left - 0.5 && box.right <= bounds.right + 0.5 && box.top >= bounds.top - 0.5 && box.bottom <= bounds.bottom + 0.5
    const viewport = new DOMRect(0, 0, innerWidth, innerHeight)
    let clipped = false
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      const bounds = parent.getBoundingClientRect()
      for (const box of boxes) {
        if (/hidden|clip|auto|scroll/.test(style.overflowX) && (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5)) clipped = true
        if (/hidden|clip|auto|scroll/.test(style.overflowY) && (box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5)) clipped = true
      }
    }
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      ownerContained: inside(port, viewport), scrollable: /auto|scroll/.test(getComputedStyle(main).overflowY),
      horizontalFit: boxes.every(box => box.left >= port.left - 0.5 && box.right <= port.right + 0.5) && main.scrollWidth <= main.clientWidth,
      exposed: !clipped && boxes.every(box => inside(box, viewport)), hit: !!hit && element.contains(hit)
    }
  })
  const initial = await measure()
  expect(initial).toMatchObject({ ownerContained: true, scrollable: true, horizontalFit: true })
  if (!initial.exposed) await chip.evaluate(element => element.scrollIntoView({ block: 'center' }))
  expect(await measure()).toMatchObject({ exposed: true, hit: true })
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 360, height: 640 }]) {
    test(`family and recipe help wraps and remains reachable in ${theme} at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
      await page.goto('/')
      if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
      await loadClipboard(page, `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
/ {
  behaviors { kestrel: arbitrary { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&kp>, <&kp>; }; };
  keymap { compatible = "zmk,keymap";
    base { bindings = <&kestrel LCTRL A>; };
    lower { bindings = <&trans>; };
    raise { bindings = <&trans>; };
  };
};`)
      await page.getByRole('button', { name: '&kestrel LCTRL A, layer 0', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Edit key' })
      await page.evaluate(() => document.fonts.ready)
      const named = dialog.getByRole('button', { name: '&kestrel', exact: true })
      await expect(named).toHaveAttribute('title', /hold-tap family/)
      const recipes = dialog.locator('[data-behavior-recipe]')
      await expect(recipes).toHaveCount(3)
      for (const chip of [named, ...await dialog.locator('[data-behavior-presets] button, [data-hsb-picker] input').all()]) {
        await expectHelpReachable(chip)
      }
      const presetLayout = await dialog.locator('[data-behavior-presets] .key-editor-chips').evaluate(element => ({
        fits: element.scrollWidth <= element.clientWidth,
        rows: new Set([...element.querySelectorAll('[data-behavior-recipe]')].map(el => Math.round(el.getBoundingClientRect().top))).size
      }))
      expect(presetLayout.fits).toBe(true)
      if (viewport.width === 360) expect(presetLayout.rows).toBeGreaterThan(1)
      const recipe = dialog.locator('[data-rgblayer-layer="1"]')
      await recipe.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(recipe).toBeFocused()
      expect(await recipe.evaluate(el => ({
        visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineWidth,
        theme: document.documentElement.dataset.colorScheme,
        font: getComputedStyle(el).fontSize
      }))).toEqual({ visible: true, outline: '2px', theme, font: '11px' })
      await page.screenshot({ path: testInfo.outputPath('family-recipe-help.png') })
      await recipe.press('Space')
      await expect(dialog.locator('.binding')).toContainText('&rgblayer 1 RGB_COLOR_HSB(')
      await expectHelpReachable(recipe)
      await page.screenshot({ path: testInfo.outputPath('recipe-selected.png') })
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: '&kestrel LCTRL A, layer 0', exact: true })).toBeFocused()
    })
  }
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