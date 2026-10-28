import { expect, test } from '@playwright/test'
import { openSource, skipCoachAndOpenEditor } from './helpers'

// Only the transport/RPC boundary is fake; the picker, adapter and core are real.
const studioMock = `
let current = { behaviorId: 7, param1: 4, param2: 0 }, saved = { ...current };
window.usbRequests = [];
export async function connect() { return { label: 'Mock USB', abortController: new AbortController() }; }
export function create_rpc_connection(_transport, options) {
  return { notification_readable: new ReadableStream({ start(controller) {
    options.signal.addEventListener('abort', () => { try { controller.close(); } catch {} });
  } }) };
}
export async function call_rpc(_connection, request) {
  window.usbRequests.push(request);
  const method = Object.keys(request.core || request.behaviors || request.keymap)[0];
  if (method === 'getBehaviorDetails') {
    const id = request.behaviors.getBehaviorDetails.behaviorId;
    return { behaviors: { getBehaviorDetails: { id, displayName: id === 7 ? '&uc' : 'Selected firmware behavior', metadata: id === 7
      ? [{ param1: [{ name: 'Value', range: { min: 0, max: 10 } }], param2: [{ name: 'Unused', nil: {} }] }]
      : [{ param1: [{ name: 'Normal', range: { min: 0, max: 0x10ffff } }], param2: [{ name: 'Shift', range: { min: 0, max: 0x10ffff } }] }] } } };
  }
  if (method === 'setLayerBinding') { current = { ...request.keymap.setLayerBinding.binding }; return { keymap: { setLayerBinding: 0 } }; }
  if (method === 'saveChanges') { saved = { ...current }; return { keymap: { saveChanges: { ok: true } } }; }
  return {
    getDeviceInfo: { core: { getDeviceInfo: { name: 'Browser test keyboard', serialNumber: new Uint8Array([1]) } } },
    getLockState: { core: { getLockState: 1 } },
    listAllBehaviors: { behaviors: { listAllBehaviors: { behaviors: [7, 37] } } },
    getPhysicalLayouts: { keymap: { getPhysicalLayouts: { activeLayoutIndex: 0, layouts: [{ name: 'Test', keys: [{ x: 0, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 }] }] } } },
    getKeymap: { keymap: { getKeymap: { layers: [{ id: 9, name: 'Base', bindings: [{ ...current }] }], availableLayers: 1, maxLayerNameLength: 16 } } },
    checkUnsavedChanges: { keymap: { checkUnsavedChanges: JSON.stringify(current) !== JSON.stringify(saved) } }
  }[method];
}
`

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 360, height: 640 }]) {
    test(`USB Unicode controls in ${theme} at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
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
      await panel.getByLabel('USB binding format').selectOption('unicode')
      const source = panel.getByLabel('USB Unicode binding', { exact: true })
      const identity = panel.getByLabel('USB Unicode firmware behavior ID')
      const write = panel.getByRole('button', { name: 'Write binding' })
      await expect(write).toBeDisabled()
      await expect(identity).toHaveValue('')
      await source.fill('&uc UC_DE_AE')
      await write.click()
      await expect(panel).toContainText('select a firmware behavior ID')
      await identity.selectOption('7')
      await write.click()
      await expect(panel).toContainText('missing-unicode-parameter-set')
      await expect(page.locator('.publish-status')).toHaveText('USB settings')
      await identity.selectOption('37')
      await write.focus()
      await page.keyboard.press('Enter')
      await expect(panel).toContainText('Keyboard binding changed, not saved')
      await expect(page.locator('.publish-status')).toHaveText('USB unsaved')
      const writes = await page.evaluate(() => (window as unknown as {
        usbRequests: { keymap?: { setLayerBinding?: unknown } }[]
      }).usbRequests.flatMap(request => request.keymap?.setLayerBinding ? [request.keymap.setLayerBinding] : []))
      expect(writes).toEqual([{ layerId: 9, keyPosition: 0, binding: { behaviorId: 37, param1: 0xe4, param2: 0xc4 } }])

      for (const control of await panel.locator('button, input, select').all()) {
        await control.scrollIntoViewIfNeeded()
        expect(await control.evaluate(element => {
          const rect = element.getBoundingClientRect()
          const port = element.closest('.source-popover')!.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { inside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= Math.max(0, port.top) && rect.bottom <= Math.min(innerHeight, port.bottom), border: style.borderTopWidth }
        })).toEqual({ inside: true, border: '1px' })
      }
      await source.scrollIntoViewIfNeeded()
      await source.focus()
      expect(await source.evaluate(element => {
        const style = getComputedStyle(element)
        const reference = getComputedStyle(element.closest('fieldset')!.querySelector('select')!)
        return { outline: style.outlineWidth, height: style.height, fontSize: style.fontSize, themed: style.backgroundColor === reference.backgroundColor && style.color === reference.color, theme: document.documentElement.dataset.colorScheme }
      })).toEqual({ outline: '2px', height: '24px', fontSize: '12px', themed: true, theme })
      await page.screenshot({ path: testInfo.outputPath('usb-unicode.png') })
      await panel.getByRole('button', { name: 'Save keyboard settings' }).click()
      await expect(panel).toContainText('Keyboard settings saved')
      await expect(panel).toContainText('overrides the flashed keymap')
      await expect(panel).toContainText('not a .keymap, GitHub or Clipboard save')
      await expect(page.locator('.publish-status')).toHaveText('USB settings')
      await panel.getByRole('button', { name: 'Disconnect USB' }).click()
      await expect(source).toBeDisabled()
      await expect(identity).toBeDisabled()
      await expect(write).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('source-menu-trigger')).toBeFocused()
    })
  }
}
