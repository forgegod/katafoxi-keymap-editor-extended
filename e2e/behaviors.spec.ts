import { expect, type Page, test } from '@playwright/test'
import { openSource } from './helpers'

// Synthetic closed-source document: no board, external includes or hardware writes.
const SOURCE = `// Preserve this user-owned preamble.
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/modifiers.h>
/ {
  combos {
    compatible = "zmk,combos";
    chord { key-positions = <0 1>; bindings = <&kp C>; timeout-ms = <40>; };
  };
  keymap {
    compatible = "zmk,keymap";
    base {
      bindings = <&kp A &kp B>;
      sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;
    };
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

test.beforeEach(async ({ context, page }) => {
  await page.addInitScript(() => localStorage.setItem('coachTourDone', '1'))
  await page.goto('/')
  await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName('Demo keyboard: Corne')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
})

test('Clipboard behaviors create/bind key, combo and encoder/edit/cancel/export/re-import stably', async ({ page }) => {
  await loadClipboard(page, SOURCE)
  const panel = page.getByRole('dialog', { name: 'Behaviors', exact: true })
  const open = () => page.getByRole('button', { name: 'Behaviors', exact: true }).click()
  const action = (name: string) => panel.getByRole('button', { name, exact: true }).click()
  const preview = panel.getByLabel('Behavior source preview', { exact: true })

  await open()
  await action('New behavior')
  await panel.getByLabel('Behavior type', { exact: true }).selectOption('zmk,behavior-sticky-key')
  await panel.getByLabel('Behavior label', { exact: true }).fill('sticky')
  await panel.getByLabel('release-after-ms', { exact: true }).fill('100')
  await panel.getByLabel('quick-release', { exact: true }).check()
  await panel.getByRole('button', { name: 'Preview changes', exact: true }).press('Enter')
  await expect(panel).toContainText('Global definition: changes affect every reference. Invocation arguments stay per key, combo or encoder.')
  await expect(preview).toContainText('sticky: sticky')
  await panel.getByRole('button', { name: 'Apply changes', exact: true }).press('Enter')
  await action('Close')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await open()
  await expect(panel.getByRole('button', { name: 'Edit &sticky', exact: true })).toHaveCount(0)
  await action('Close')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await open()

  // Same global definition, distinct per-site operands; cancel must not bind.
  await action('Use &sticky')
  await panel.getByLabel('Behavior argument 1', { exact: true }).fill('A')
  await action('Preview binding')
  await expect(panel.getByLabel('Binding replacement')).toHaveText('&kp A → &sticky A')
  await action('Cancel')
  await expect(page.getByRole('button', { name: '&kp A, layer 0', exact: true })).toBeVisible()
  await action('Use &sticky')
  await panel.getByLabel('Behavior argument 1', { exact: true }).fill('A')
  await action('Preview binding'); await action('Apply changes')
  await action('Use &sticky')
  await panel.getByLabel('Behavior destination', { exact: true }).selectOption('combo')
  await panel.getByLabel('Behavior target combo', { exact: true }).selectOption('chord')
  await panel.getByLabel('Behavior argument 1', { exact: true }).fill('LS(B)')
  await action('Preview binding')
  await expect(panel.getByLabel('Binding replacement')).toHaveText('&kp C → &sticky LS(B)')
  await action('Apply changes')
  await action('Delete &sticky')
  await expect(panel.getByRole('alert')).toContainText('incoming references')
  await expect(preview).toHaveCount(0)

  await action('New behavior')
  await panel.getByLabel('Behavior type', { exact: true }).selectOption('zmk,behavior-sensor-rotate')
  await panel.getByLabel('Behavior label', { exact: true }).fill('dial')
  await panel.getByLabel('Child 1 binding', { exact: true }).fill('&kp C_VOL_UP')
  await panel.getByLabel('Child 2 binding', { exact: true }).fill('&kp C_VOL_DN')
  await panel.getByLabel('tap-ms', { exact: true }).fill('0')
  await action('Preview changes'); await action('Apply changes')
  await action('Use &dial')
  await expect(panel.getByLabel('Behavior destination', { exact: true })).toHaveValue('sensor')
  await expect(panel.getByLabel('Behavior argument 1', { exact: true })).toHaveCount(0)
  await expect(panel).toContainText('Replaces the whole adapter, not one turn.')
  await panel.getByLabel('Behavior target encoder', { exact: true }).selectOption('0')
  await action('Preview binding')
  await expect(panel.getByLabel('Binding replacement')).toHaveText('&inc_dec_kp C_VOL_UP C_VOL_DN → &dial')
  await action('Apply changes')

  await action('Edit &sticky')
  await expect(panel.getByLabel('Behavior type', { exact: true })).toBeDisabled()
  await panel.getByLabel('release-after-ms', { exact: true }).fill('0')
  await panel.getByLabel('quick-release', { exact: true }).uncheck()
  await action('Preview changes'); await action('Apply changes')
  await action('Edit &dial')
  await panel.getByLabel('tap-ms', { exact: true }).fill('10')
  await action('Preview changes'); await action('Apply changes')
  await action('Close')
  const copied = await copyKeymap(page)
  expect(copied.slice(0, copied.indexOf('/ {'))).toBe(SOURCE.slice(0, SOURCE.indexOf('/ {')))
  expect(copied).toMatch(/bindings\s*=\s*<\s*&sticky A\s+&kp B\s*>/)
  expect(copied).toMatch(/bindings\s*=\s*<\s*&sticky LS\(B\)\s*>/)
  expect(copied).toMatch(/sensor-bindings\s*=\s*<\s*&dial\s*>/)
  expect(copied).toContain('release-after-ms = <0>')
  expect(copied).not.toContain('quick-release')
  expect(copied).toContain('tap-ms = <10>')
  expect(copied).toContain('timeout-ms = <40>')

  await open(); await action('Edit &dial')
  await panel.getByLabel('tap-ms', { exact: true }).fill('999')
  await action('Preview changes')
  await expect(preview).toContainText('tap-ms = <999>')
  await action('Cancel'); await action('Close')
  expect(await copyKeymap(page)).toBe(copied)

  // Load the actual exported artifact via the picker, not an editor-state hook.
  await loadClipboard(page, copied)
  await expect(page.getByRole('button', { name: '&sticky A, layer 0', exact: true })).toBeVisible()
  await open(); await action('Edit &sticky')
  await expect(panel.getByLabel('release-after-ms', { exact: true })).toHaveValue('0')
  await expect(panel.getByLabel('quick-release', { exact: true })).not.toBeChecked()
  await action('Cancel'); await action('Use &sticky')
  await panel.getByLabel('Behavior destination', { exact: true }).selectOption('combo')
  await expect(panel.getByLabel('Behavior target combo').locator('option:checked')).toHaveText('chord · &sticky LS(B)')
  await action('Cancel'); await action('Edit &dial')
  await expect(panel.getByLabel('tap-ms', { exact: true })).toHaveValue('10')
  await expect(panel.getByLabel('Child 1 binding', { exact: true })).toHaveValue('&kp C_VOL_UP')
  await expect(panel.getByLabel('Child 2 binding', { exact: true })).toHaveValue('&kp C_VOL_DN')
  await action('Cancel'); await action('Use &dial')
  await expect(panel.getByLabel('Behavior target encoder').locator('option:checked')).toHaveText('0 · &dial')
  await action('Cancel'); await action('Close')
  expect(await copyKeymap(page)).toBe(copied)
})

for (const source of ['Demo', 'Clipboard']) {
  test(`${source} behavior creation survives layer duplicate, move, undo/redo and a further edit`, async ({ page }) => {
    if (source === 'Clipboard') {
      await loadClipboard(page, SOURCE.replace('    base {', '    lower { bindings = <&kp C &kp D>; };\n    base {'))
    }
    await page.getByRole('button', { name: 'Behaviors', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Behaviors', exact: true })
    const action = (name: string) => panel.getByRole('button', { name, exact: true }).click()
    await action('New behavior')
    await panel.getByLabel('Behavior label', { exact: true }).fill('layer_dance')
    await panel.getByLabel('Child 1 binding', { exact: true }).fill('&mo 1')
    await action('Preview changes'); await action('Apply changes'); await action('Close')

    await page.getByRole('button', { name: /^Show host legend / }).first().focus()
    const names = await page.locator('#host-legend-layers .layer-name').allTextContents()
    expect(names.length).toBeGreaterThan(1)
    await page.getByRole('button', { name: `Duplicate layer ${names[1]} (1)`, exact: true }).click()
    const copiedName = `${names[1]} copy`
    await expect(page.locator('#host-legend-layers .layer-name')).toHaveText([...names, copiedName])
    await page.getByRole('button', { name: `Move layer ${copiedName} (${names.length})`, exact: true }).click()
    await page.getByRole('combobox', { name: 'New layer position' }).selectOption('1')
    await page.getByRole('button', { name: 'Apply layer move' }).click()
    await expect(page.locator('#host-legend-layers .layer-name')).toHaveText([names[0], copiedName, ...names.slice(1)])
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await page.getByRole('button', { name: /^Show host legend / }).first().focus()
    await expect(page.locator('#host-legend-layers .layer-name')).toHaveText([...names, copiedName])
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await page.getByRole('button', { name: 'Behaviors', exact: true }).click()
    await action('Edit &layer_dance')
    await expect(panel.getByLabel('Child 1 binding', { exact: true })).toHaveValue('&mo 2')
    await panel.getByLabel('tapping-term-ms', { exact: true }).fill('0')
    await action('Preview changes')
    await expect(panel.getByLabel('Behavior source preview', { exact: true })).toContainText('bindings = <&mo 2>;')
    await action('Apply changes'); await action('Close')
    if (source === 'Clipboard') {
      const copied = await copyKeymap(page)
      expect(copied).toContain('bindings = <&mo 2>;')
      expect(copied).toContain('tapping-term-ms = <0>;')
      await loadClipboard(page, copied)
      expect(await copyKeymap(page)).toBe(copied)
    }
  })
}

test('opaque definitions and stock overrides stay read-only and byte-preserved on actual export', async ({ page }) => {
  const opaque = SOURCE.replace('/ {', `/ {
  behaviors {
    opaque: opaque { compatible = "zmk,behavior-tap-dance"; #binding-cells = <0>; vendor,extra = <1>; bindings = <&kp A>; };
  };`)
  const panel = page.getByRole('dialog', { name: 'Behaviors', exact: true })
  for (const source of [opaque, SOURCE + '\n&mt { tapping-term-ms = <180>; };']) {
    await loadClipboard(page, source)
    await page.getByRole('button', { name: 'Behaviors', exact: true }).click()
    if (source === opaque) {
      await expect(panel.getByRole('button', { name: 'Edit &opaque', exact: true })).toBeDisabled()
      await expect(panel.getByRole('button', { name: 'Use &opaque', exact: true })).toBeDisabled()
      await expect(panel.getByLabel('Behavior diagnostics &opaque', { exact: true })).toContainText('vendor,extra')
    } else {
      await expect(panel.getByRole('button', { name: 'New behavior', exact: true })).toBeDisabled()
      await expect(panel.getByLabel('Behavior authoring availability')).toContainText('Reference coverage is incomplete')
    }
    await expect(panel).toContainText('Review unsupported source externally and reload')
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    expect(await copyKeymap(page)).toBe(source)
  }
})
