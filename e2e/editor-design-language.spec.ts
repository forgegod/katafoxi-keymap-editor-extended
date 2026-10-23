import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { openSource } from './helpers'

const SOURCE = `// Preserve this user's source.
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/modifiers.h>
/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A &kp B>; }; }; };`
const LABEL = `long_macro_${'segment_'.repeat(8)}end`

async function load(page: Page, source = SOURCE) {
  await openSource(page, 'Clipboard')
  const picker = page.getByRole('dialog', { name: /Paste a \.keymap from the clipboard/ })
  await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
  await picker.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(picker).toBeHidden()
}

// Resolve semantic tokens in the actual theme rather than copying hex values.
async function controlStyle(control: Locator, kind: 'outline' | 'danger' | 'accent' | 'field' | 'disabled' | 'disabled-field' = 'outline') {
  const actual = await control.evaluate((element, kind) => {
    const style = getComputedStyle(element)
    const probe = document.createElement('span')
    element.parentElement!.appendChild(probe)
    probe.style.backgroundColor = kind === 'danger' ? 'transparent' : kind === 'accent' ? 'var(--accent)' : ['field', 'disabled', 'disabled-field'].includes(kind) ? 'var(--surface-sunken)' : 'var(--surface)'
    probe.style.color = kind.startsWith('disabled') ? 'var(--text-disabled)' : kind === 'danger' ? 'var(--danger-ink)' : kind === 'accent' ? 'var(--on-accent)' : 'var(--text)'
    probe.style.borderColor = kind === 'danger' ? 'var(--danger-border)' : kind.startsWith('disabled') ? 'var(--border-subtle)' : 'var(--border)'
    const expected = getComputedStyle(probe)
    const result = {
      font: style.fontFamily, expectedFont: getComputedStyle(document.documentElement).fontFamily,
      size: style.fontSize, expectedSize: style.getPropertyValue('--font-md').trim(),
      color: style.color, expectedColor: expected.color,
      background: style.backgroundColor, expectedBackground: expected.backgroundColor,
      border: style.borderTopColor, expectedBorder: expected.borderTopColor,
      borderWidth: style.borderTopWidth, radius: parseFloat(style.borderTopLeftRadius),
      height: element.getBoundingClientRect().height, cursor: style.cursor,
      margin: style.margin, type: element.getAttribute('type')
    }
    probe.remove()
    return result
  }, kind)
  const name = await control.getAttribute('aria-label') ?? await control.textContent()
  expect.soft(actual.font, `${name}: inherited font`).toBe(actual.expectedFont)
  expect.soft(actual.size, `${name}: shared type scale`).toBe(actual.expectedSize)
  expect.soft(actual.color, `${name}: foreground`).toBe(actual.expectedColor)
  expect.soft(actual.background, `${name}: surface`).toBe(actual.expectedBackground)
  expect.soft(actual.radius, `${name}: intentional radius`).toBeGreaterThanOrEqual(4)
  if (kind !== 'accent') {
    expect.soft(actual.border, `${name}: border role`).toBe(actual.expectedBorder)
    expect.soft(actual.borderWidth, `${name}: border width`).toBe('1px')
  }
  if (!kind.includes('field')) {
    expect.soft(actual.height, `${name}: ordinary chrome height`).toBe(30)
    expect.soft(actual.margin, `${name}: layout gap rather than button margins`).toBe('0px')
    expect.soft(actual.type, `${name}: explicit button type`).toBe('button')
  }
  if (kind.startsWith('disabled')) {
    await expect(control).toBeDisabled()
    expect.soft(actual.cursor, `${name}: disabled cursor`).toBe('not-allowed')
  }
}

async function focusStyle(page: Page, control: Locator) {
  await control.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(control).toBeFocused()
  const focus = await control.evaluate(element => {
    const style = getComputedStyle(element)
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    element.parentElement!.appendChild(probe)
    const result = { visible: element.matches(':focus-visible'), width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor, expected: getComputedStyle(probe).color }
    probe.remove()
    return result
  })
  expect.soft(focus).toMatchObject({ visible: true, width: '2px', offset: '1px' })
  expect.soft(focus.color).toBe(focus.expected)
}

async function inspectState(page: Page, dialog: Locator, info: TestInfo, state: string) {
  const panel = dialog.locator('.macro-panel')
  const layout = await panel.evaluate(element => {
    const box = element.getBoundingClientRect()
    return {
      contained: box.left >= 8 && box.top >= 8 && box.right <= innerWidth - 8 && box.bottom <= innerHeight - 8,
      overflow: getComputedStyle(element).overflowY,
      fits: element.scrollWidth <= element.clientWidth,
      childrenFit: [...element.querySelectorAll('input, select, textarea, button, p, h3, pre')].every(child => {
        const rect = child.getBoundingClientRect()
        return rect.left >= box.left && rect.right <= box.right
      })
    }
  })
  expect.soft(layout, `${state}: containment and horizontal reachability`).toEqual({ contained: true, overflow: 'auto', fits: true, childrenFit: true })
  await panel.evaluate(element => element.scrollTop = 0)
  await page.screenshot({ path: info.outputPath(`${state}-top.png`) })
  await panel.evaluate(element => element.scrollTop = element.scrollHeight)
  await page.screenshot({ path: info.outputPath(`${state}-bottom.png`) })
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 360, height: 640 }]) {
    test.describe(`${theme} ${viewport.width}x${viewport.height}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(viewport)
        await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
        await page.goto('/')
        if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
        await expect(page.locator('html')).toHaveAttribute('data-color-scheme', theme)
      })

      test('Macro list, ordered form, invocation and confirmation use editor control roles', async ({ page }, info) => {
        await load(page)
        const launcher = page.getByRole('button', { name: 'Macros', exact: true })
        await controlStyle(launcher)
        await launcher.press('Enter')
        const dialog = page.getByRole('dialog', { name: 'Macros', exact: true })
        const action = (name: string) => dialog.getByRole('button', { name, exact: true })
        await page.mouse.move(0, 0)
        await controlStyle(action('New macro'))
        await focusStyle(page, action('New macro'))
        await action('New macro').hover()
        const hover = await action('New macro').evaluate(element => {
          const style = getComputedStyle(element)
          const probe = document.createElement('span')
          probe.style.color = 'var(--accent)'
          element.appendChild(probe)
          const result = { color: style.color, border: style.borderTopColor, expected: getComputedStyle(probe).color }
          probe.remove()
          return result
        })
        expect.soft(hover.color).toBe(hover.expected)
        expect.soft(hover.border).toBe(hover.expected)
        await inspectState(page, dialog, info, 'empty-list-focus')
        await action('New macro').press('Enter')
        await page.mouse.move(0, 0)
        await controlStyle(dialog.getByLabel('Macro label', { exact: true }), 'field')
        await controlStyle(dialog.getByLabel('Parameter count', { exact: true }), 'field')
        await controlStyle(action('Move step 1 up'), 'disabled')
        await controlStyle(action('Move step 1 down'), 'disabled')
        await controlStyle(action('Remove step 1'), 'danger')
        await focusStyle(page, dialog.getByLabel('Macro label', { exact: true }))
        await dialog.getByLabel('Macro label', { exact: true }).fill(LABEL)
        await dialog.getByLabel('Display name', { exact: true }).fill('Long display name with wrapping context '.repeat(5))
        await dialog.getByLabel('Parameter count', { exact: true }).selectOption('1')
        await dialog.getByLabel('Step 1 type', { exact: true }).selectOption('param_1to1')
        for (let i = 2; i <= 8; i++) await action('Add step').click()
        await dialog.getByLabel('Step 2 binding', { exact: true }).fill('&kp MACRO_PLACEHOLDER')
        await dialog.getByLabel('Tap time (ms)', { exact: true }).fill('4294967296')
        await action('Preview changes').click()
        await expect(dialog.getByRole('alert')).toContainText('Timing must be a decimal integer')
        await inspectState(page, dialog, info, 'long-form-validation')
        const overflow = await dialog.locator('.macro-panel').evaluate(element => element.scrollHeight > element.clientHeight)
        expect(overflow, 'long form scrolls within its panel').toBe(true)
        await dialog.getByLabel('Tap time (ms)', { exact: true }).fill('0')
        await action('Preview changes').press('Enter')
        await expect(dialog.getByLabel('Macro source preview')).toContainText(LABEL)
        await page.mouse.move(0, 0)
        await controlStyle(action('Confirm changes'), 'accent')
        await focusStyle(page, action('Confirm changes'))
        await inspectState(page, dialog, info, 'source-confirmation')
        await action('Confirm changes').press('Enter')
        await page.mouse.move(0, 0)
        await controlStyle(action(`Edit &${LABEL}`))
        await controlStyle(action(`Use &${LABEL}`))
        await controlStyle(action(`Delete &${LABEL}`), 'danger')
        await inspectState(page, dialog, info, 'populated-list')
        await action(`Edit &${LABEL}`).click()
        await controlStyle(dialog.getByLabel('Parameter count', { exact: true }), 'disabled-field')
        await action('Cancel').click()
        await action(`Use &${LABEL}`).click()
        await controlStyle(dialog.getByLabel('Macro destination', { exact: true }), 'field')
        await controlStyle(dialog.getByLabel('Macro target layer', { exact: true }), 'field')
        await controlStyle(dialog.getByLabel('Macro target key', { exact: true }), 'field')
        await controlStyle(dialog.getByLabel('Macro argument 1', { exact: true }), 'field')
        await dialog.getByLabel('Macro argument 1', { exact: true }).fill('NOT_A_KEY')
        await action('Preview binding').click()
        await expect(dialog.getByRole('alert')).toBeVisible()
        await inspectState(page, dialog, info, 'invocation-validation')
        await dialog.getByLabel('Macro argument 1', { exact: true }).fill('LS(A)')
        await action('Preview binding').click()
        await expect(dialog.getByLabel('Binding replacement')).toContainText(`&kp A → &${LABEL} LS(A)`)
        await inspectState(page, dialog, info, 'invocation-confirmation')
        await action('Cancel').click()
        await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
        await action(`Delete &${LABEL}`).click()
        await expect(dialog.getByLabel('Binding replacement')).toContainText('No incoming references')
        await inspectState(page, dialog, info, 'deletion-confirmation')
        await action('Cancel').click()
        await action('Close').focus()
        await page.keyboard.press('Tab')
        await expect(action(`Edit &${LABEL}`)).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(launcher).toBeFocused()
      })

      test('Text to sequence fields, acknowledgement and disabled actions are themed', async ({ page }, info) => {
        await load(page)
        await page.getByRole('button', { name: 'Macros', exact: true }).click()
        await page.getByRole('button', { name: 'Text to sequence', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Text to sequence', exact: true })
        const text = dialog.getByLabel('Macro text', { exact: true })
        const use = dialog.getByRole('button', { name: 'Use generated sequence', exact: true })
        await controlStyle(text, 'field')
        await controlStyle(use, 'disabled')
        await focusStyle(page, text)
        await inspectState(page, dialog, info, 'text-empty-disabled')
        await text.fill('é')
        await dialog.getByRole('checkbox').check()
        await expect(dialog.getByRole('alert')).toContainText('U+00E9')
        await controlStyle(use, 'disabled')
        await inspectState(page, dialog, info, 'text-invalid')
        await text.fill('Ab[]'.repeat(6))
        await expect(use).toBeEnabled()
        await expect(dialog.getByLabel('Generated sequence')).toContainText('&kp LS(A)')
        await page.mouse.move(0, 0)
        await controlStyle(use)
        await inspectState(page, dialog, info, 'text-valid-long-preview')
        await use.press('Enter')
        const form = page.getByRole('dialog', { name: 'Macros', exact: true })
        await expect(form.getByLabel('Tap time (ms)', { exact: true })).toHaveValue('40')
        await expect(form.getByLabel('Wait time (ms)', { exact: true })).toHaveValue('40')
        await inspectState(page, form, info, 'generated-form')
        await form.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(form.getByRole('button', { name: 'Edit &new_macro', exact: true })).toHaveCount(0)
      })

      test('opaque Macro diagnostics wrap while disabled controls and source refusal remain intact', async ({ page }, info) => {
        const property = `unsupported_${'long_property_'.repeat(8)}`
        await load(page, SOURCE.replace('/ {', `/ { macros { opaque: opaque { compatible = "zmk,behavior-macro"; #binding-cells = <0>; ${property} = <1>; bindings = <&kp A>; }; };`))
        await page.getByRole('button', { name: 'Macros', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Macros', exact: true })
        await controlStyle(dialog.getByRole('button', { name: 'Edit &opaque', exact: true }), 'disabled')
        await controlStyle(dialog.getByRole('button', { name: 'Use &opaque', exact: true }), 'disabled')
        await expect(dialog.getByLabel('Macro diagnostics &opaque')).toContainText(property)
        await inspectState(page, dialog, info, 'read-only-long-diagnostic')
        await dialog.getByRole('button', { name: 'Delete &opaque', exact: true }).click()
        await expect(dialog.getByRole('alert')).toContainText('not a uniquely owned editable')
        await expect(dialog.getByLabel('Macro source preview')).toHaveCount(0)
        await inspectState(page, dialog, info, 'read-only-refusal')
      })
    })
  }
}
