import { expect, test } from '@playwright/test'
import { openSource, skipCoachAndOpenEditor } from './helpers'

// Transport/RPC boundary only: the real Svelte UI, adapter, core validation and
// native leave warning run in Chromium. No physical keyboard is certified.
const studioMock = `
let current = 4, saved = 4;
export async function connect() { return { label: 'Mock USB', abortController: new AbortController() }; }
export function create_rpc_connection(_transport, options) {
  return { notification_readable: new ReadableStream({ start(controller) {
    options.signal.addEventListener('abort', () => { try { controller.close(); } catch {} });
  } }) };
}
export async function call_rpc(_connection, request) {
  const method = Object.keys(request.core || request.behaviors || request.keymap)[0];
  const replies = {
    getDeviceInfo: { core: { getDeviceInfo: { name: 'Browser test keyboard', serialNumber: new Uint8Array([1]) } } },
    getLockState: { core: { getLockState: 1 } },
    listAllBehaviors: { behaviors: { listAllBehaviors: { behaviors: [7] } } },
    getBehaviorDetails: { behaviors: { getBehaviorDetails: { id: 7, displayName: 'Test behavior', metadata: [{ param1: [{ name: 'Value', range: { min: 0, max: 10 } }], param2: [{ name: 'Unused', nil: {} }] }] } } },
    getPhysicalLayouts: { keymap: { getPhysicalLayouts: { activeLayoutIndex: 0, layouts: [{ name: 'Test', keys: [{ x: 0, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 }] }] } } },
    getKeymap: { keymap: { getKeymap: { layers: [{ id: 9, name: 'Base', bindings: [{ behaviorId: 7, param1: current, param2: 0 }] }], availableLayers: 1, maxLayerNameLength: 16 } } },
    checkUnsavedChanges: { keymap: { checkUnsavedChanges: current !== saved } }
  };
  if (method === 'setLayerBinding') { current = request.keymap.setLayerBinding.binding.param1; return { keymap: { setLayerBinding: 0 } }; }
  if (method === 'saveChanges') { saved = current; return { keymap: { saveChanges: { ok: true } } }; }
  if (method === 'discardChanges') { current = saved; return { keymap: { discardChanges: true } }; }
  if (method === 'resetSettings') { current = saved = 4; return { core: { resetSettings: true } }; }
  return replies[method];
}
`

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 360, height: 640 }]) {
    test(`USB settings controls and leave warning in ${theme} at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'serial', { value: { requestPort() {} }, configurable: true })
      })
      await page.route(url => url.pathname.includes('zmk-studio-ts-client'), route => route.fulfill({ contentType: 'application/javascript', body: studioMock }))
      await skipCoachAndOpenEditor(page)
      if (theme === 'light') await page.getByRole('button', { name: 'Color theme: Dark' }).click()
      await openSource(page, 'USB')
      await page.getByRole('button', { name: 'Connect USB', exact: true }).click()
      await expect(page.locator('.publish-status')).toHaveText('USB settings')
      await page.getByTestId('source-menu-trigger').click()
      const panel = page.getByRole('region', { name: 'USB keyboard' })
      await expect(panel).toContainText('not a .keymap, GitHub or Clipboard save')
      const parameter = panel.getByRole('spinbutton', { name: 'Parameter 1', exact: true })
      await parameter.fill('11')
      await panel.getByRole('button', { name: 'Write binding' }).click()
      await expect(panel).toContainText('metadata-refusal')
      await parameter.fill('5')
      const write = panel.getByRole('button', { name: 'Write binding' })
      await write.focus()
      await expect(write).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.locator('.publish-status')).toHaveText('USB unsaved')
      await expect(panel).toContainText('not saved')

      for (const control of await panel.locator('button, input, select').all()) {
        // The source popover owns scrolling; expose controls without page scrolling.
        await control.scrollIntoViewIfNeeded()
        expect(await control.evaluate(element => {
          const rect = element.getBoundingClientRect()
          const port = element.closest('.source-popover')!.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { inside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= Math.max(0, port.top) && rect.bottom <= Math.min(innerHeight, port.bottom),
            font: style.fontFamily, background: style.backgroundColor, border: style.borderTopWidth }
        })).toMatchObject({ inside: true, border: '1px' })
      }
      await parameter.scrollIntoViewIfNeeded()
      await parameter.focus()
      expect(await parameter.evaluate(element => ({ outline: getComputedStyle(element).outlineWidth, fontSize: getComputedStyle(element).fontSize, theme: document.documentElement.dataset.colorScheme }))).toEqual({ outline: '2px', fontSize: '12px', theme })
      await page.screenshot({ path: testInfo.outputPath('usb-settings.png') })

      const leave = page.waitForEvent('dialog')
      await page.close({ runBeforeUnload: true })
      const dialog = await leave
      expect(dialog.type()).toBe('beforeunload')
      await dialog.dismiss()
      await expect(page.locator('.publish-status')).toHaveText('USB unsaved')
      await panel.getByRole('button', { name: 'Save keyboard settings' }).click()
      await expect(page.locator('.publish-status')).toHaveText('USB settings')
      await expect(panel).toContainText('Keyboard settings saved')
      await expect(panel.getByRole('button', { name: 'Save keyboard settings' })).toBeDisabled()
      page.once('dialog', dialog => dialog.accept())
      await panel.getByRole('button', { name: 'Restore stock' }).click()
      await expect(panel).toContainText('Stock keyboard settings restored')
      await panel.getByRole('button', { name: 'Disconnect USB' }).click()
      await expect(page.locator('.publish-status')).toHaveText('USB disconnected')
      await expect(write).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('source-menu-trigger')).toBeFocused()
    })
  }
}
