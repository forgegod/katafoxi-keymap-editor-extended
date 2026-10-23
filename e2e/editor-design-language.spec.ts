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
  const picker = page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: /Paste your board \.keymap/ }) })
  await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
  await picker.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(picker).toBeHidden()
}

// Resolve semantic tokens in the actual theme rather than copying hex values.
async function controlStyle(control: Locator, kind: 'outline' | 'danger' | 'accent' | 'field' | 'disabled' | 'disabled-field' | 'disabled-danger' = 'outline') {
  const actual = await control.evaluate((element, kind) => {
    const style = getComputedStyle(element)
    const probe = document.createElement('span')
    element.parentElement!.appendChild(probe)
    probe.style.backgroundColor = kind.includes('danger') ? 'transparent' : kind === 'accent' ? 'var(--accent)' : ['field', 'disabled', 'disabled-field'].includes(kind) ? 'var(--surface-sunken)' : 'var(--surface)'
    probe.style.color = kind.startsWith('disabled') ? 'var(--text-disabled)' : kind === 'danger' ? 'var(--danger-ink)' : kind === 'accent' ? 'var(--on-accent)' : 'var(--text)'
    probe.style.borderColor = kind === 'danger' ? 'var(--danger-border)' : kind === 'disabled-danger' ? 'var(--border-soft)' : kind.startsWith('disabled') ? 'var(--border-subtle)' : 'var(--border)'
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

async function stateColors(control: Locator, foreground: string, border: string, background: string) {
  const actual = await control.evaluate((element, tokens) => {
    const style = getComputedStyle(element)
    const probe = document.createElement('span')
    probe.style.cssText = `color:var(--${tokens[0]});border-color:var(--${tokens[1]});background:var(--${tokens[2]})`
    element.parentElement!.appendChild(probe)
    const expected = getComputedStyle(probe)
    const result = { color: style.color, border: style.borderTopColor, background: style.backgroundColor,
      expectedColor: expected.color, expectedBorder: expected.borderTopColor, expectedBackground: expected.backgroundColor }
    probe.remove()
    return result
  }, [foreground, border, background])
  expect(actual.color).toBe(actual.expectedColor)
  expect(actual.border).toBe(actual.expectedBorder)
  expect(actual.background).toBe(actual.expectedBackground)
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

      test('Behavior list, ordered children and source confirmation use editor control roles', async ({ page }, info) => {
        await load(page)
        const launcher = page.getByRole('button', { name: 'Behaviors', exact: true })
        await launcher.press('Enter')
        const dialog = page.getByRole('dialog', { name: 'Behaviors', exact: true })
        const action = (name: string) => dialog.getByRole('button', { name, exact: true })
        const field = (name: string) => dialog.getByLabel(name, { exact: true })
        await page.mouse.move(0, 0)
        await controlStyle(action('New behavior'))
        await controlStyle(action('Close'))
        await focusStyle(page, action('New behavior'))
        await action('New behavior').hover()
        await stateColors(action('New behavior'), 'accent', 'accent', 'surface')
        await inspectState(page, dialog, info, 'behavior-empty-focus')
        await action('New behavior').press('Enter')
        await controlStyle(field('Behavior label'), 'field')
        await controlStyle(field('Behavior type'), 'field')
        await controlStyle(field('Child 1 binding'), 'field')
        await controlStyle(field('tapping-term-ms'), 'field')
        await controlStyle(action('Move child 1 up'), 'disabled')
        await controlStyle(action('Move child 1 down'), 'disabled')
        await controlStyle(action('Remove child 1'), 'disabled-danger')
        await field('Child 1 binding').focus()
        await page.keyboard.press('Tab')
        await expect(action('Add child')).toBeFocused()
        await focusStyle(page, field('Behavior label'))
        const label = `dance_${'long_segment_'.repeat(8)}end`
        await field('Behavior label').fill(label)
        for (let i = 2; i <= 8; i++) await action('Add child').click()
        await field('Child 2 binding').fill('&kp LS(A)')
        await action('Move child 2 up').press('Enter')
        await expect(field('Child 1 binding')).toHaveValue('&kp LS(A)')
        await action('Move child 1 down').press('Enter')
        await expect(field('Child 2 binding')).toHaveValue('&kp LS(A)')
        await action('Remove child 8').click()
        await expect(field('Child 8 binding')).toHaveCount(0)
        await page.mouse.move(0, 0)
        await controlStyle(action('Remove child 1'), 'danger')
        await controlStyle(action('Add child'))
        await controlStyle(action('Preview changes'))
        await controlStyle(action('Cancel'))
        await field('tapping-term-ms').fill('4294967296')
        await action('Preview changes').click()
        await expect(dialog.getByRole('alert')).toContainText('decimal integer')
        await stateColors(dialog.getByRole('alert'), 'warn-ink', 'warn-border', 'warn-wash')
        await expect(field('Behavior source preview')).toHaveCount(0)
        await inspectState(page, dialog, info, 'behavior-ordered-validation')
        expect(await dialog.locator('.macro-panel').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
        await field('tapping-term-ms').fill('0')
        await action('Preview changes').press('Enter')
        await expect(field('Behavior source preview')).toContainText('bindings = <&kp A>, <&kp LS(A)>')
        await page.mouse.move(0, 0)
        await controlStyle(action('Apply changes'), 'accent')
        await focusStyle(page, action('Apply changes'))
        await inspectState(page, dialog, info, 'behavior-source-confirmation')
        await action('Apply changes').press('Enter')
        await page.mouse.move(0, 0)
        await controlStyle(action(`Edit &${label}`))
        await controlStyle(action(`Use &${label}`))
        await controlStyle(action(`Delete &${label}`), 'danger')
        await action(`Delete &${label}`).hover()
        await stateColors(action(`Delete &${label}`), 'danger-ink', 'danger-border', 'danger-wash')
        await inspectState(page, dialog, info, 'behavior-populated-list')
        await action(`Edit &${label}`).click()
        await controlStyle(field('Behavior type'), 'disabled-field')
        await action('Cancel').click()
        await action(`Delete &${label}`).click()
        await expect(field('Binding replacement')).toContainText('No incoming references')
        await inspectState(page, dialog, info, 'behavior-deletion-confirmation')
        await action('Cancel').click()
        await action('Close').focus()
        await page.keyboard.press('Tab')
        await expect(action(`Edit &${label}`)).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(launcher).toBeFocused()
      })

      test('Behavior family fields and typed key, combo and encoder invocation are themed', async ({ page }, info) => {
        const source = SOURCE.replace('/ {', '/ { combos { compatible = "zmk,combos"; chord { key-positions = <0 1>; bindings = <&kp C>; }; };')
          .replace('base { bindings', 'base { sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>; bindings')
        await load(page, source)
        const launcher = page.getByRole('button', { name: 'Behaviors', exact: true })
        await launcher.click()
        const dialog = page.getByRole('dialog', { name: 'Behaviors', exact: true })
        const action = (name: string) => dialog.getByRole('button', { name, exact: true })
        const field = (name: string) => dialog.getByLabel(name, { exact: true })
        await action('New behavior').click()
        await field('Behavior type').selectOption('zmk,behavior-hold-tap')
        await controlStyle(field('flavor'), 'field')
        await focusStyle(page, field('flavor'))
        await field('flavor').selectOption('tap-preferred')
        await field('tapping-term-ms').fill('180')
        await expect(field('quick-tap-ms')).toHaveValue('')
        await controlStyle(field('quick-tap-ms'), 'field')
        await inspectState(page, dialog, info, 'behavior-hold-tap-flavor')
        await action('Preview changes').click()
        await expect(field('Behavior source preview')).toContainText('flavor = "tap-preferred"')
        await expect(field('Behavior source preview')).not.toContainText('quick-tap-ms')
        await action('Cancel').click()

        await action('New behavior').click()
        await field('Behavior type').selectOption('zmk,behavior-mod-morph')
        await controlStyle(field('mods'), 'field')
        await controlStyle(field('keep-mods'), 'field')
        await action('Preview changes').click()
        await expect(dialog.getByRole('alert')).toContainText('mods is required')
        await stateColors(dialog.getByRole('alert'), 'warn-ink', 'warn-border', 'warn-wash')
        await inspectState(page, dialog, info, 'behavior-mod-morph-required')
        await action('Cancel').click()

        await action('New behavior').click()
        await field('Behavior type').selectOption('zmk,behavior-sticky-key')
        await field('Behavior label').fill('sticky')
        await controlStyle(field('release-after-ms'), 'field')
        await field('release-after-ms').fill('0')
        await field('quick-release').check()
        await focusStyle(page, field('quick-release'))
        const checkbox = await field('quick-release').evaluate(el => ({
          accent: getComputedStyle(el).accentColor, outline: getComputedStyle(el).outlineColor,
          layout: getComputedStyle(el.parentElement!).display
        }))
        expect(checkbox.accent).toBe(checkbox.outline)
        expect(checkbox.layout).toBe('flex')
        await expect(dialog).toContainText('Bare child references forward invocation arguments')
        await inspectState(page, dialog, info, 'behavior-sticky-form')
        await action('Preview changes').click()
        await expect(field('Behavior source preview')).toContainText('quick-release;')
        await action('Apply changes').click()
        await action('Use &sticky').click()
        await expect(dialog).toContainText('Argument 1 · code')
        for (const name of ['Behavior destination', 'Behavior target layer', 'Behavior target key', 'Behavior argument 1']) {
          await controlStyle(field(name), 'field')
        }
        await field('Behavior argument 1').fill(`INVALID_${'LONG_BINDING_'.repeat(12)}`)
        await action('Preview binding').click()
        await expect(dialog.getByRole('alert')).toBeVisible()
        await stateColors(dialog.getByRole('alert'), 'warn-ink', 'warn-border', 'warn-wash')
        await expect(field('Behavior source preview')).toHaveCount(0)
        await inspectState(page, dialog, info, 'behavior-typed-invocation-validation')
        await field('Behavior argument 1').fill('LS(A)')
        await action('Preview binding').click()
        await expect(field('Binding replacement')).toHaveText('&kp A → &sticky LS(A)')
        await action('Cancel').click()
        await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
        await action('Use &sticky').click()
        await field('Behavior destination').selectOption('combo')
        await controlStyle(field('Behavior target combo'), 'field')
        await field('Behavior argument 1').fill('LS(B)')
        await inspectState(page, dialog, info, 'behavior-combo-invocation')
        await action('Preview binding').click()
        await expect(field('Binding replacement')).toHaveText('&kp C → &sticky LS(B)')
        await action('Cancel').click()

        await action('New behavior').click()
        await field('Behavior type').selectOption('zmk,behavior-sensor-rotate')
        await field('Behavior label').fill('dial')
        await controlStyle(field('tap-ms'), 'field')
        await field('Child 1 binding').fill('&kp C_VOL_UP')
        await field('Child 2 binding').fill('&kp C_VOL_DN')
        await inspectState(page, dialog, info, 'behavior-sensor-form')
        await action('Preview changes').click()
        await action('Apply changes').click()
        await action('Use &dial').click()
        await controlStyle(field('Behavior target encoder'), 'field')
        await expect(field('Behavior argument 1')).toHaveCount(0)
        await expect(dialog).toContainText('Replaces the whole adapter, not one turn.')
        await page.mouse.move(0, 0)
        await controlStyle(action('Preview binding'))
        await inspectState(page, dialog, info, 'behavior-encoder-invocation')
        await action('Preview binding').click()
        await expect(field('Binding replacement')).toHaveText('&inc_dec_kp C_VOL_UP C_VOL_DN → &dial')
        await inspectState(page, dialog, info, 'behavior-encoder-preview')
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(launcher).toBeFocused()
        await launcher.press('Enter')
        await action('Use &dial').click()
        await expect(field('Behavior target encoder').locator('option:checked')).toHaveText('0 · &inc_dec_kp C_VOL_UP C_VOL_DN')
      })

      test('Behavior read-only diagnostics and source restrictions keep disabled actions themed', async ({ page }, info) => {
        const property = `unsupported_${'long_property_'.repeat(8)}`
        const opaque = SOURCE.replace('/ {', `/ { behaviors { opaque: opaque { compatible = "zmk,behavior-tap-dance"; #binding-cells = <0>; ${property} = <1>; bindings = <&kp A>; }; };`)
        for (const restricted of [false, true]) {
          await load(page, opaque + (restricted ? '\n&mt { tapping-term-ms = <180>; };' : ''))
          const launcher = page.getByRole('button', { name: 'Behaviors', exact: true })
          await launcher.press('Enter')
          const dialog = page.getByRole('dialog', { name: 'Behaviors', exact: true })
          const action = (name: string) => dialog.getByRole('button', { name, exact: true })
          await page.mouse.move(0, 0)
          await controlStyle(action('Edit &opaque'), 'disabled')
          await controlStyle(action('Use &opaque'), 'disabled')
          await expect(dialog.getByLabel('Behavior diagnostics &opaque')).toContainText(property)
          if (restricted) {
            await controlStyle(action('Delete &opaque'), 'disabled-danger')
            await controlStyle(action('New behavior'), 'disabled')
            await expect(dialog.getByLabel('Behavior authoring availability')).toContainText('Reference coverage is incomplete')
            await expect(action('Close')).toBeFocused()
            await page.keyboard.press('Tab')
            await expect(action('Close')).toBeFocused()
            await inspectState(page, dialog, info, 'behavior-source-restricted')
          } else {
            await inspectState(page, dialog, info, 'behavior-read-only-diagnostic')
            await action('Delete &opaque').click()
            await expect(dialog.getByRole('alert')).toContainText('not a uniquely owned editable')
            await stateColors(dialog.getByRole('alert'), 'warn-ink', 'warn-border', 'warn-wash')
            await expect(dialog.getByLabel('Behavior source preview')).toHaveCount(0)
            await inspectState(page, dialog, info, 'behavior-read-only-refusal')
          }
          await page.keyboard.press('Escape')
          await expect(dialog).toBeHidden()
          await expect(launcher).toBeFocused()
        }
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
