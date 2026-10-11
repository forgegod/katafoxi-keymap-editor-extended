import { expect, type Page, test } from '@playwright/test'
import {
  encodeKeyBinding, parseDtsKeymap, parseKeymap
} from '../packages/keymap-core/dist/index.js'
import { openSource, readDraftCount, skipCoachAndOpenEditor } from './helpers'

const PREAMBLE = '// Synthetic layer-operation fixture; keep these bytes.\r\n#include <behaviors.dtsi>\r\n#include <dt-bindings/zmk/keys.h>\r\n'
const SUFFIX = '\r\n// Exterior suffix stays byte-identical.\r\n'
const SOURCE = PREAMBLE + `/ {
  keymap {
    compatible = "zmk,keymap";
    base_label: Base {
      // Base metadata stays with Base.
      display-name = "Base display";
      bindings = <&mo 2 &lt 1 A>;
      sensor-bindings = <&inc_dec_kp A B>;
    };
    lower_label: Lower {
      // Lower metadata stays with Lower.
      bindings = <&to 1 &kp B>;
      sensor-bindings = <&inc_dec_kp C D>;
    };
    raise_label: Raise {
      bindings = <&tog 2 &kp C>;
      sensor-bindings = <&inc_dec_kp E F>;
    };
    Adjust {
      bindings = <&sl 2 &kp D>;
      sensor-bindings = <&inc_dec_kp G H>;
    };
  };
  combos {
    compatible = "zmk,combos";
    scoped { key-positions = <0 1>; bindings = <&to 2>; layers = <1 2>; };
  };
  conditional_layers {
    compatible = "zmk,conditional-layers";
    tri { if-layers = <1 2>; then-layer = <3>; };
  };
};`.replace(/\n/g, '\r\n') + SUFFIX

async function loadClipboard(page: Page, source = SOURCE) {
  await openSource(page, 'Clipboard')
  // The source menu's title changes after the first successful load.
  const picker = page.getByRole('dialog').filter({
    has: page.getByRole('textbox', { name: /Paste your board \.keymap/ })
  })
  await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
  await picker.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(picker).toBeHidden()
}

async function expandLayers(page: Page) {
  // Focus, rather than hover, proves the row is reachable with a keyboard.
  await page.getByRole('button', { name: 'Show host legend Base', exact: true }).focus()
  await expect(page.getByRole('button', { name: 'Move layer Lower (1)', exact: true })).toBeVisible()
}

async function copySource(page: Page) {
  await page.getByRole('button', { name: 'Copy .keymap', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Exported keymap' })
  await expect(sheet.getByRole('status')).toContainText('Copied to the system clipboard')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  return copied
}

function bindings(source: string) {
  return parseKeymap(parseDtsKeymap(source))
}

for (const method of ['keyboard', 'drag'] as const) {
  test(`${method} move and duplicate export/reparse keep reference targets and source locality`, async ({ page, context }, testInfo) => {
    await skipCoachAndOpenEditor(page)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await loadClipboard(page)
    await expandLayers(page)
    const duplicate = page.getByRole('button', { name: 'Duplicate layer Lower (1)', exact: true })
    await duplicate.focus()
    await duplicate.press('Enter')
    await expect(duplicate).toBeFocused()
    await expect(page.locator('#host-legend-layers .layer-name')).toHaveText(['Base', 'Lower', 'Raise', 'Adjust', 'Lower copy'])
    await expect(page.getByRole('button', { name: 'Show Lower copy', exact: true })).toHaveAttribute('aria-pressed', 'false')

    const move = page.getByRole('button', { name: 'Move layer Lower (1)', exact: true })
    if (method === 'keyboard') {
      await move.focus()
      await move.press('Space')
      const position = page.getByRole('combobox', { name: 'New layer position' })
      await expect(position).toBeFocused()
      await position.press('ArrowDown')
      await expect(position).toHaveValue('2')
      await position.press('Tab')
      await expect(page.getByRole('button', { name: 'Apply layer move' })).toBeFocused()
      await page.keyboard.press('Enter')
    } else {
      await move.dragTo(page.getByRole('button', { name: 'Move layer Raise (2)', exact: true }))
    }
    await expect(page.getByRole('button', { name: 'Move layer Lower (2)', exact: true })).toBeFocused()
    await expect(page.locator('#host-legend-layers .layer-name')).toHaveText(['Base', 'Raise', 'Lower', 'Adjust', 'Lower copy'])
    await expect(page.getByRole('region', { name: 'Host legend' }).getByRole('status')).toContainText('Layer priority changed')
    await expect(page.getByRole('button', { name: '&mo 1, layer 0', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`layer-${method}-moved.png`) })

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expandLayers(page)
    await expect(page.locator('#host-legend-layers .layer-name')).toHaveText(['Base', 'Lower', 'Raise', 'Adjust', 'Lower copy'])
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    const copied = await copySource(page)
    // Textarea input normalizes CRLF; the existing Clipboard adapter trims edges.
    expect(copied.startsWith(PREAMBLE.replace(/\r\n/g, '\n'))).toBe(true)
    expect(copied.endsWith(SUFFIX.replace(/\r\n/g, '\n').trimEnd())).toBe(true)
    expect(copied).toContain('base_label: Base')
    expect(copied).toContain('lower_label: Lower')
    expect(copied).toContain('// Lower metadata stays with Lower.')
    expect(copied.indexOf('raise_label: Raise')).toBeLessThan(copied.indexOf('lower_label: Lower'))
    expect(copied.match(/lower_label:/g)).toHaveLength(1)
    const parsed = bindings(copied)
    expect(parsed.layer_names).toEqual(['Base', 'Raise', 'Lower', 'Adjust', 'layer_4'])
    expect(parsed.layers.map(row => row.map(encodeKeyBinding))).toEqual([
      ['&mo 1', '&lt 2 A'], ['&tog 1', '&kp C'], ['&to 2', '&kp B'],
      ['&sl 1', '&kp D'], ['&to 2', '&kp B']
    ])
    expect(parsed.sensorBindings?.map(row => row.map(encodeKeyBinding))).toEqual([
      ['&inc_dec_kp A B'], ['&inc_dec_kp E F'], ['&inc_dec_kp C D'],
      ['&inc_dec_kp G H'], ['&inc_dec_kp C D']
    ])
    expect(parsed.combos).toHaveLength(1)
    expect(parsed.combos?.[0].layers).toEqual([2, 1])
    expect(encodeKeyBinding(parsed.combos![0].binding)).toBe('&to 1')
    expect(parsed.conditionalLayers).toEqual([{ id: 'tri', ifLayers: [1, 2], thenLayer: 3 }])
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await expect.poll(() => readDraftCount(page)).toBe(0)

    await loadClipboard(page, copied)
    await page.getByRole('button', { name: 'Show host legend Base', exact: true }).focus()
    await expect(page.locator('#host-legend-layers .layer-name')).toHaveText(['Base', 'Raise', 'Lower', 'Adjust', 'layer_4'])
    // A second unchanged export must be stable, not a regenerated template.
    expect(await copySource(page)).toBe(copied)
  })
}

test('keyboard cancel, unchanged position and native drag cancellation preserve redo and clean state', async ({ page }) => {
  await skipCoachAndOpenEditor(page)
  await loadClipboard(page)
  await expandLayers(page)
  const move = page.getByRole('button', { name: 'Move layer Lower (1)', exact: true })
  await move.click()
  await page.getByRole('combobox', { name: 'New layer position' }).selectOption('2')
  await page.getByRole('button', { name: 'Apply layer move' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expandLayers(page)
  for (const cancel of ['Escape', 'Cancel', 'unchanged']) {
    await move.focus()
    await move.press('Enter')
    if (cancel === 'Escape') {
      await page.getByRole('combobox', { name: 'New layer position' }).press('ArrowDown')
      await page.keyboard.press('Escape')
    } else if (cancel === 'Cancel') {
      await page.getByRole('button', { name: 'Cancel layer move' }).click()
    } else {
      await page.getByRole('button', { name: 'Apply layer move' }).click()
    }
    await expect(move).toBeFocused()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled()
  }
  const box = await move.boundingBox()
  if (!box) throw new Error('Move control missing')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 10, { steps: 5 })
  await expect(page.getByRole('region', { name: 'Host legend' }).getByRole('status')).toContainText('Moving Lower')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(move).toBeFocused()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled()
  await expect.poll(() => readDraftCount(page)).toBe(0)
})

test('unsafe source refuses duplicate and both move gestures without changing exported bytes', async ({ page, context }, testInfo) => {
  await skipCoachAndOpenEditor(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const source = SOURCE.replace('#include <behaviors.dtsi>', '#include "external.dtsi"')
  await loadClipboard(page, source)
  await expandLayers(page)
  const status = page.getByRole('region', { name: 'Host legend' }).getByRole('status')
  await page.getByRole('button', { name: 'Duplicate layer Lower (1)', exact: true }).click()
  await expect(status).toContainText('Review the source or definition externally')
  const move = page.getByRole('button', { name: 'Move layer Lower (1)', exact: true })
  await move.click()
  await page.getByRole('combobox', { name: 'New layer position' }).selectOption('2')
  await page.getByRole('button', { name: 'Apply layer move' }).click()
  await expect(status).toContainText('unverified include')
  await move.dragTo(page.getByRole('button', { name: 'Move layer Raise (2)', exact: true }))
  await expect(status).toContainText('unverified include')
  await expect(move).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('layer-unsafe-refusal.png') })
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  expect(await copySource(page)).toBe(source.replace(/\r\n/g, '\n').trim())
})
