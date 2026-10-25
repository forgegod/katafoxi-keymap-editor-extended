import { expect, type Page, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { editKey, openSource } from './helpers'

const LARK_DIR = path.join(
  process.cwd(),
  'packages/keymap-core/fixtures/lark'
)
const KEYMAP_TEXT = fs.readFileSync(path.join(LARK_DIR, 'lark.keymap'), 'utf8')
const INFO_TEXT = fs.readFileSync(path.join(LARK_DIR, 'info.json'), 'utf8')

const ESC_KEY = '.key[data-label="1,0"]'
const NEW_KEYCODE = 'F13'
const ORIGINAL_BIND = '&kp ESC'
const EDITED_BIND = `&kp ${NEW_KEYCODE}`
const INFERRED_WARNING =
  'No info.json — using a flat rectangular board from the binding count. Paste info.json for the real layout.'
const GARBAGE_KEYMAP = '/* empty */'
const GARBAGE_ERROR = 'No layers with bindings found in .keymap'

function normalizeNewlines(text: string) {
  return text.replace(/\r\n/g, '\n')
}

function preambleBeforeKeymapBlock(source: string) {
  const marker = 'keymap {'
  const idx = source.indexOf(marker)
  if (idx === -1) throw new Error('keymap source has no "keymap {" block')
  return source.slice(0, idx)
}

function layerSlice(source: string, start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

function layer0BindingCount(source: string) {
  const slice = layerSlice(source, 'layer_0', 'layer_1')
  const open = slice.indexOf('<')
  const close = slice.lastIndexOf('>')
  if (open === -1 || close <= open) {
    throw new Error('layer_0 has no bindings list')
  }
  return slice
    .slice(open + 1, close)
    .split(/\s+/)
    .filter(token => token.startsWith('&')).length
}

async function openClipboardPicker(page: Page) {
  await openSource(page, 'Clipboard')
  const picker = page.getByRole('dialog', {
    name: /Paste a \.keymap from the clipboard/
  })
  await expect(picker).toBeVisible()
  return picker
}

test.describe('Clipboard source', () => {
  test.beforeEach(async ({ context, page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('coachTourDone', '1')
    })
    await page.goto('/')
    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      'Demo keyboard: Corne'
    )
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(page.url()).origin
    })
  })

  test('Copy .keymap splices an edit and keeps the preamble', async ({
    page
  }) => {
    const picker = await openClipboardPicker(page)
    await picker
      .getByRole('textbox', { name: /Paste your board \.keymap/ })
      .fill(KEYMAP_TEXT)
    await picker
      .getByRole('textbox', { name: /rectangular board from binding count/ })
      .fill(INFO_TEXT)
    await picker.getByRole('button', { name: 'Load' }).click()

    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      'Clipboard keyboard: lark'
    )
    await editKey(
      page,
      page.locator(ESC_KEY).getByRole('button', { name: '&kp ESC, layer 0' }),
      NEW_KEYCODE
    )

    const copy = page.getByRole('button', { name: 'Copy .keymap' })
    await expect(copy).toBeEnabled()
    await copy.click()
    const exportDialog = page.getByRole('dialog', { name: 'Exported keymap' })
    await expect(exportDialog).toBeVisible()
    await expect(
      exportDialog.getByRole('status').filter({
        hasText: 'Copied to the system clipboard'
      })
    ).toBeVisible()

    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain(EDITED_BIND)
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(normalizeNewlines(preambleBeforeKeymapBlock(copied))).toBe(
      normalizeNewlines(preambleBeforeKeymapBlock(KEYMAP_TEXT))
    )
    const layer0 = layerSlice(copied, 'layer_0', 'layer_1')
    expect(layer0).toContain(EDITED_BIND)
    expect(layer0).not.toContain(ORIGINAL_BIND)
  })

  test('omitted info.json infers a rectangular board from the binding count', async ({
    page
  }) => {
    const picker = await openClipboardPicker(page)
    await picker
      .getByRole('textbox', { name: /Paste your board \.keymap/ })
      .fill(KEYMAP_TEXT)
    await picker.getByRole('button', { name: 'Load' }).click()

    await expect(page.getByTestId('source-menu-trigger')).toHaveAccessibleName(
      'Clipboard keyboard: clipboard (inferred)'
    )
    await expect(page.getByRole('status')).toContainText(INFERRED_WARNING)
    const bindingCount = layer0BindingCount(KEYMAP_TEXT)
    await expect
      .poll(() => page.getByRole('button', { name: /, layer 0/ }).count())
      .toBe(bindingCount)
  })

  test('Apply preserves an external Unicode binding when another key is edited', async ({ page }) => {
    const source = `#include <behaviors.dtsi>
#include <behaviors/unicode.dtsi>
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer { bindings = <&uc UC_DE_AE &kp A>; };
  };
};`
    const picker = await openClipboardPicker(page)
    await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
    await picker.getByRole('button', { name: 'Load' }).click()

    const unicode = page.getByRole('button', { name: '&uc UC_DE_AE, layer 0', exact: true })
    await expect(unicode).toBeVisible()
    await unicode.click()
    const dialog = page.getByRole('dialog', { name: 'Edit key' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Apply' }).click()
    await expect(dialog).toBeHidden()
    await expect(unicode).toBeVisible()

    await editKey(page, page.getByRole('button', { name: '&kp A, layer 0', exact: true }), NEW_KEYCODE)
    await page.getByRole('button', { name: 'Copy .keymap' }).click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(EDITED_BIND)
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain('&uc UC_DE_AE')
    expect(preambleBeforeKeymapBlock(copied)).toBe(preambleBeforeKeymapBlock(source))
  })

  for (const { behavior, command, label, index } of [
    { behavior: '&bt', command: 'BT_DISC', label: 'DISC', index: '2' },
    { behavior: '&bt', command: 'BT_CLR_ALL', label: 'CLR ALL' },
    { behavior: '&rgb_ug', command: 'RGB_ON', label: 'RGB_ON' },
    { behavior: '&rgb_ug', command: 'RGB_OFF', label: 'RGB_OFF' }
  ]) {
    test(`${command} survives selection, cancel, Apply, reopen and export`, async ({ page }) => {
      const binding = `${behavior} ${command}${index === undefined ? '' : ` ${index}`}`
      const source = `#define USER_SETTING 1
#include <behaviors.dtsi>
#include <dt-bindings/zmk/bt.h>
#include <dt-bindings/zmk/rgb.h>
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer { bindings = <&kp A ${binding}>; };
  };
};`
      const picker = await openClipboardPicker(page)
      await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
      await picker.getByRole('button', { name: 'Load' }).click()

      const dialog = page.getByRole('dialog', { name: 'Edit key' })
      const original = page.getByRole('button', { name: '&kp A, layer 0', exact: true })
      const imported = page.getByRole('button', { name: `${binding}, layer 0`, exact: true })
      await imported.click()
      await expect(dialog.locator('#key-editor-binding')).toHaveText(binding)
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(imported).toBeVisible()

      await original.click()
      await dialog.getByRole('button', { name: behavior, exact: true }).click()
      await dialog.getByRole('button', { name: label, exact: true }).press('Enter')
      if (index !== undefined) {
        await expect(dialog.locator('.key-editor-choice').filter({ hasText: /^\d+$/ }))
          .toHaveText(['0', '1', '2', '3', '4'])
        await dialog.getByRole('button', { name: 'Pick a key to finish the combo', exact: true }).click()
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: '0', exact: true }).click()
        await expect(dialog.locator('#key-editor-binding')).toHaveText('&bt BT_DISC 0')
        // Space selects a focused choice; Enter applies an already complete binding.
        await dialog.getByRole('button', { name: index, exact: true }).press('Space')
      }
      await expect(dialog.locator('#key-editor-binding')).toHaveText(binding)
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(imported).toHaveCount(2)

      await imported.first().click()
      await expect(dialog.locator('#key-editor-binding')).toHaveText(binding)
      await dialog.getByRole('button', { name: '&none', exact: true }).click()
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(imported).toHaveCount(2)
      await imported.first().click()
      await expect(dialog.locator('#key-editor-binding')).toHaveText(binding)
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(dialog).toBeHidden()

      await page.getByRole('button', { name: 'Copy .keymap' }).click()
      const exported = page.getByRole('dialog', { name: 'Exported keymap' })
      await expect(exported.getByRole('status')).toContainText('Copied to the system clipboard')
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      expect(preambleBeforeKeymapBlock(copied)).toBe(preambleBeforeKeymapBlock(source))
      const bindings = copied.match(/bindings\s*=\s*<([^>]+)>/)?.[1]
      expect(bindings?.trim().replace(/\s+/g, ' ')).toBe(`${binding} ${binding}`)
    })
  }

  test('stock documentation help preserves redo and source while ordinary Studio Unlock selection stays staged', async ({ page }) => {
    const source = `// Existing encoder binding and user-owned source remain unchanged by help.
#include <behaviors.dtsi>
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer { bindings = <&kp A &inc_dec_kp C_VOL_UP C_VOL_DN>; };
  };
};`
    const picker = await openClipboardPicker(page)
    await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
    await picker.getByRole('button', { name: 'Load', exact: true }).click()
    const original = page.getByRole('button', { name: '&kp A, layer 0', exact: true })
    await editKey(page, original, 'F13')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await expect(redo).toBeEnabled()
    const opened: unknown[][] = []
    await page.exposeFunction('recordBehaviorHelp', (...args: unknown[]) => opened.push(args))
    await page.evaluate(() => {
      window.open = ((...args: unknown[]) => {
        void (window as unknown as { recordBehaviorHelp: (...args: unknown[]) => Promise<void> }).recordBehaviorHelp(...args)
        return null
      }) as typeof window.open
    })
    await original.click()
    const dialog = page.getByRole('dialog', { name: 'Edit key' })
    for (const [code, url] of [
      ['&inc_dec_kp', 'https://zmk.dev/docs/features/encoders#rotation'],
      ['&studio_unlock', 'https://zmk.dev/docs/keymaps/behaviors/studio-unlock']
    ]) {
      for (const modifier of ['Control', 'Meta'] as const) {
        opened.length = 0
        await dialog.getByRole('button', { name: code, exact: true }).click({ modifiers: [modifier] })
        await expect.poll(() => opened).toEqual([[url, '_blank', 'noopener,noreferrer']])
        await expect(dialog.locator('.binding')).toHaveText('&kp A')
        await expect(original).toBeVisible()
      }
    }
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(redo).toBeEnabled()
    await redo.click()
    await expect(page.getByRole('button', { name: '&kp F13, layer 0', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await page.getByRole('button', { name: 'Copy .keymap' }).click()
    await expect(page.getByRole('dialog', { name: 'Exported keymap' }).getByRole('status')).toContainText('Copied to the system clipboard')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source)
    await page.keyboard.press('Escape')
    await original.click()
    await dialog.getByRole('button', { name: '&studio_unlock', exact: true }).press('Space')
    await expect(dialog.locator('.binding')).toHaveText('&studio_unlock')
    await expect(original).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await original.click()
    await dialog.getByRole('button', { name: '&studio_unlock', exact: true }).press('Space')
    await expect(original).toBeVisible()
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByRole('button', { name: '&studio_unlock, layer 0', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Copy .keymap' }).click()
    await expect(page.getByRole('dialog', { name: 'Exported keymap' }).getByRole('status')).toContainText('Copied to the system clipboard')
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied.slice(0, copied.indexOf('bindings = <'))).toBe(source.slice(0, source.indexOf('bindings = <')))
    expect(copied.match(/bindings\s*=\s*<([^>]+)>/)?.[1]?.trim().replace(/\s+/g, ' '))
      .toBe('&studio_unlock &inc_dec_kp C_VOL_UP C_VOL_DN')
    expect(copied.slice(copied.indexOf('>;'))).toBe(source.slice(source.indexOf('>;')))
  })

  test.describe('CHG-009 stock picker integration', () => {
    const stockCases = [
      { behavior: '&out', argument: 'OUT_NONE' },
      { behavior: '&out', argument: 'OUT_USB' },
      { behavior: '&out', argument: 'OUT_BLE' },
      { behavior: '&kt', argument: 'F13', wrap: true },
      { behavior: '&kt', argument: 'LALT' },
      { behavior: '&gresc' },
      { behavior: '&soft_off' },
      { behavior: '&sys_reset' },
      { behavior: '&bootloader' }
    ]

    for (const { behavior, argument, wrap } of stockCases) {
      const binding = `${behavior}${argument ? ` ${wrap ? `LA(${argument})` : argument}` : ''}`
      test(`${binding} survives selection, Apply, reopen, cancel and clipboard export`, async ({ page }) => {
        const source = `// User-owned preamble; the editor must not repair includes.
#define USER_SETTING 1
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/outputs.h>
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer { bindings = <&kp A ${binding}>; };
  };
};`
        const picker = await openClipboardPicker(page)
        await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
        await picker.getByRole('button', { name: 'Load', exact: true }).click()

        const dialog = page.getByRole('dialog', { name: 'Edit key' })
        const preview = dialog.locator('#key-editor-binding')
        const original = page.getByRole('button', { name: '&kp A, layer 0', exact: true })
        const applied = page.getByRole('button', { name: `${binding}, layer 0`, exact: true })
        // Imported stock bindings take the same real no-op Apply path.
        await applied.click()
        await expect(preview).toHaveText(binding)
        await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
        await expect(dialog).toBeHidden()
        await expect(applied).toHaveCount(1)

        const selectStock = async () => {
          await expect(dialog.getByRole('button', { name: '&reset', exact: true })).toHaveCount(0)
          await dialog.getByRole('button', { name: behavior, exact: true }).click()
          if (behavior === '&out') {
            for (const [command, description] of [
              ['OUT_USB', 'Prefer sending to USB.'],
              ['OUT_BLE', 'Prefer sending to the current Bluetooth profile.'],
              ['OUT_NONE', 'Prevent sending any output.']
            ]) {
              await expect(dialog.getByRole('button', { name: command, exact: true }))
                .toHaveAttribute('title', description)
            }
            await dialog.getByRole('button', { name: argument!, exact: true }).press('Enter')
          } else if (behavior === '&kt') {
            await expect(dialog.getByPlaceholder('Filter values…')).toBeVisible()
            await dialog.getByRole('button', { name: 'Pick a key to finish the combo', exact: true }).click()
            await expect(dialog).toBeVisible()
            await expect(original).toBeVisible()
            await dialog.getByPlaceholder('Filter values…').fill(argument!)
            await dialog.getByRole('button', { name: argument!, exact: true }).press('Enter')
            if (wrap) await dialog.getByRole('button', { name: 'LA hold — LALT', exact: true }).click()
          } else {
            await expect(dialog.getByPlaceholder('Filter values…')).toHaveCount(0)
            await expect(dialog.locator('[data-slot-values], .key-editor-values')).toHaveCount(0)
            if (behavior === '&soft_off') {
              await expect(dialog.locator('.key-editor-note')).toContainText('CONFIG_ZMK_PM_SOFT_OFF=y')
              await expect(dialog.locator('.key-editor-note')).toContainText('requires hardware power-off support')
              await expect(dialog.locator('.key-editor-note')).toContainText('Wake-up depends on the keyboard hardware')
              await expect(dialog.locator('.key-editor-note')).toContainText('does not change firmware configuration or turn off hardware')
            }
          }
          await expect(preview).toHaveText(binding)
          await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeVisible()
          // Even parameterless choices remain staged until Apply.
          await expect(original).toBeVisible()
          await expect(applied).toHaveCount(1)
        }

        await original.click()
        await selectStock()
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(dialog).toBeHidden()
        await original.click()
        await expect(preview).toHaveText('&kp A')
        await selectStock()
        await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
        await expect(dialog).toBeHidden()
        await expect(applied).toHaveCount(2)

        await applied.first().click()
        await expect(preview).toHaveText(binding)
        await dialog.getByRole('button', { name: '&none', exact: true }).click()
        await expect(preview).toHaveText('&none')
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(dialog).toBeHidden()
        await expect(applied).toHaveCount(2)
        await applied.first().click()
        await expect(preview).toHaveText(binding)
        await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
        await expect(dialog).toBeHidden()

        await page.getByRole('button', { name: 'Copy .keymap' }).click()
        const exported = page.getByRole('dialog', { name: 'Exported keymap' })
        await expect(exported.getByRole('status')).toContainText('Copied to the system clipboard')
        const copied = await page.evaluate(() => navigator.clipboard.readText())
        expect(preambleBeforeKeymapBlock(copied)).toBe(preambleBeforeKeymapBlock(source))
        expect(copied.match(/bindings\s*=\s*<([^>]+)>/)?.[1]?.trim().replace(/\s+/g, ' '))
          .toBe(`${binding} ${binding}`)
        expect(copied.slice(copied.indexOf('>;'))).toBe(source.slice(source.indexOf('>;')))
      })
    }

    test('legacy reset JSON imports remain editable and export through the supplied source without promotion', async ({ page }) => {
      const bindings = ['&reset', '&reset WRAP(1,2) 3']
      const source = `// User-owned legacy reset definitions live in this external include.
#include "external-behaviors.dtsi"
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer { bindings = <${bindings.join(' ')} &kp B>; };
  };
};`
      const picker = await openClipboardPicker(page)
      await picker.getByRole('textbox', { name: /Paste your board \.keymap/ })
        .fill(JSON.stringify({ layers: [[...bindings, '&kp B']] }))
      await picker.getByPlaceholder('Paste the matching board .keymap from your firmware repo').fill(source)
      await picker.getByRole('button', { name: 'Load', exact: true }).click()
      await expect(picker).toBeHidden()
      const dialog = page.getByRole('dialog', { name: 'Edit key' })
      for (const binding of bindings) {
        const key = page.getByRole('button', { name: `${binding}, layer 0`, exact: true })
        await key.click()
        await expect(dialog.locator('#key-editor-binding')).toHaveText(binding)
        await expect(dialog.getByRole('button', { name: '&reset', exact: true })).toHaveCount(0)
        await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
        await expect(dialog).toBeHidden()
        await key.click()
        await expect(dialog.locator('#key-editor-binding')).toHaveText(binding)
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(dialog).toBeHidden()
      }
      await editKey(page, page.getByRole('button', { name: '&kp B, layer 0', exact: true }), 'F13')
      await page.getByRole('button', { name: 'Copy .keymap' }).click()
      const exported = page.getByRole('dialog', { name: 'Exported keymap' })
      await expect(exported.getByRole('status')).toContainText('Copied to the system clipboard')
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      expect(preambleBeforeKeymapBlock(copied)).toBe(preambleBeforeKeymapBlock(source))
      expect(copied.match(/bindings\s*=\s*<([^>]+)>/)?.[1]?.trim().replace(/\s+/g, ' '))
        .toBe(`${bindings.join(' ')} &kp F13`)
      expect(copied.slice(copied.indexOf('>;'))).toBe(source.slice(source.indexOf('>;')))
    })

    test('legacy reset and opaque imports survive no-op Apply and export without stock promotion or include repair', async ({ page }) => {
      // Deliberately opaque tokens, not firmware-valid examples or editable custom definitions.
      const bindings = [
        '&reset', '&reset WRAP(1,2) 3', '&custom WRAP(LC,2) 3',
        '&kt VENDOR_KEY(1,2)', '&kt LA(A)', '&out VENDOR_OUT 7',
        '&inc_dec_cp C_VOL_UP C_VOL_DN', '&rgb_ug RGB_COLOR_HSB(10,20,30)',
        '&gresc WRAP(LC,2) 3', '&soft_off VENDOR_ARG 7'
      ]
      const source = `// Existing external includes stay user-owned; no outputs.h or keys.h repair.
#define USER_SETTING 1
#include "external-behaviors.dtsi"
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer { bindings = <${bindings.join(' ')} &kp B>; };
  };
};`
      const picker = await openClipboardPicker(page)
      await picker.getByRole('textbox', { name: /Paste your board \.keymap/ }).fill(source)
      await picker.getByRole('button', { name: 'Load', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Edit key' })
      for (const binding of bindings) {
        await test.step(`Preserve ${binding}`, async () => {
          const key = page.getByRole('button', { name: `${binding}, layer 0`, exact: true })
          await key.click()
          await expect(dialog.locator('#key-editor-binding')).toHaveText(binding)
          for (const excluded of ['&reset', '&custom', '&inc_dec_cp']) {
            await expect(dialog.getByRole('button', { name: excluded, exact: true })).toHaveCount(0)
          }
          await expect(dialog.getByRole('button', { name: 'RGB_COLOR_HSB', exact: true })).toHaveCount(0)
          await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
          await expect(dialog).toBeHidden()
          await key.click()
          await expect(dialog.locator('#key-editor-binding')).toHaveText(binding)
          await dialog.getByRole('button', { name: '&sys_reset', exact: true }).click()
          await expect(dialog.locator('#key-editor-binding')).toHaveText('&sys_reset')
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
          await expect(dialog).toBeHidden()
          await expect(key).toBeVisible()
        })
      }
      // Force a real splice of another key, not an unchanged-source shortcut.
      await editKey(page, page.getByRole('button', { name: '&kp B, layer 0', exact: true }), 'F13')
      await page.getByRole('button', { name: 'Copy .keymap' }).click()
      const exported = page.getByRole('dialog', { name: 'Exported keymap' })
      await expect(exported.getByRole('status')).toContainText('Copied to the system clipboard')
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      expect(preambleBeforeKeymapBlock(copied)).toBe(preambleBeforeKeymapBlock(source))
      expect(copied.match(/bindings\s*=\s*<([^>]+)>/)?.[1]?.trim().replace(/\s+/g, ' '))
        .toBe(`${bindings.join(' ')} &kp F13`)
      expect(copied.slice(copied.indexOf('>;'))).toBe(source.slice(source.indexOf('>;')))
    })
  })

  test('garbage keymap shows an error and leaves the board unchanged', async ({
    page
  }) => {
    const corneE = page.getByRole('button', { name: '&kp E, layer 0' })
    await expect(corneE).toBeVisible()

    const picker = await openClipboardPicker(page)
    await picker
      .getByRole('textbox', { name: /Paste your board \.keymap/ })
      .fill(GARBAGE_KEYMAP)
    await picker.getByRole('button', { name: 'Load' }).click()

    await expect(picker.getByRole('alert')).toHaveText(GARBAGE_ERROR)
    await expect(corneE).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy .keymap' })).toHaveCount(
      0
    )
  })
})
