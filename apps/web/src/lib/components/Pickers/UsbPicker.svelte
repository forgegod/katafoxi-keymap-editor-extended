<script lang="ts">
  import { onDestroy } from 'svelte'
  import Button from '../Common/Button.svelte'
  import { UsbStudio, usbStudioAvailable, type UsbStudioStatus } from '../../usb-studio'
  import type { UsbKeyboardSelection } from '../../editor/types'
  import { editor } from '../../editor.svelte'
  import './UsbPicker.css'

  let { onSelect, onUseClipboard }: { onSelect: (event: UsbKeyboardSelection) => Promise<boolean>; onUseClipboard: () => void } = $props()
  const available = usbStudioAvailable()
  let status = $state<UsbStudioStatus>({ state: available ? 'disconnected' : 'unavailable' })
  let selection = $state.raw<UsbKeyboardSelection | undefined>()
  const session = new UsbStudio(event => onSelect(event), (next, owner, update) => {
    status = next
    if (owner) selection = owner
    editor.acceptUsbStudioState(next, owner, update)
  }, () => editor.captureUsbLoadGuard(), owner => editor.source === 'usb' && editor.usbSelection === owner)
  let layer = $state(0)
  let position = $state(0)
  let behavior = $state<number | undefined>()
  let param1 = $state<number | undefined>(0)
  let param2 = $state<number | undefined>(0)
  const writable = $derived(status.state === 'unlocked' && !status.busy && !!selection && editor.usbSelection === selection)
  $effect(() => {
    const binding = selection && editor.draftKeymap?.layers[layer]?.[position]
    behavior = typeof binding?.value === 'number' ? binding.value : undefined
    param1 = typeof binding?.params[0]?.value === 'number' ? binding.params[0].value : 0
    param2 = typeof binding?.params[1]?.value === 'number' ? binding.params[1].value : 0
  })
  function writeBinding() {
    void session.setBinding(layer, position, { value: behavior ?? NaN, params: [
      { value: param1 ?? NaN, params: [] }, { value: param2 ?? NaN, params: [] }
    ] })
  }
  function connectUsb() {
    if (status.dirty && !window.confirm('Reconnect and replace the USB snapshot? Unsaved settings are not retained in the browser and may not survive disconnect.')) return
    void session.connect()
  }
  function restoreStock() {
    if (window.confirm('Restore all stock keyboard settings with core.resetSettings? This removes saved Studio overrides and unsaved settings, not just this binding. It does not update files and cannot be undone here.')) void session.resetSettings()
  }
  onDestroy(() => session.disconnect())
</script>

<section class="usb-picker" aria-label="USB keyboard">
  <p role="status">{status.state[0].toUpperCase() + status.state.slice(1)}{status.deviceName ? ` · ${status.deviceName}` : ''}</p>
  {#if status.message}<p>{status.message}</p>{/if}
  {#if status.state === 'locked'}<p>Use the Studio Unlock key or combo on your keyboard to continue.</p>{/if}
  {#if !available}<p>Web Serial requires a supported browser and a secure context. Use Clipboard instead.</p>{/if}
  <p>Each saved binding overrides the flashed keymap at that position until Restore stock. This is not a .keymap, GitHub or Clipboard save; host files are unchanged. Unsaved settings may not survive disconnect.</p>
  <div class="usb-actions">
  <Button variant="outline" disabled={!available || status.state === 'connecting' || !!status.busy} onclick={connectUsb}>Connect USB</Button>
  {#if status.state === 'connecting' || status.state === 'locked' || status.state === 'unlocked'}
    <Button variant="outline" onclick={() => session.disconnect()}>Disconnect USB</Button>
  {/if}
  <Button variant="outline" onclick={onUseClipboard}>Use Clipboard</Button>
  </div>
  {#if selection && editor.usbSelection === selection}
    <fieldset disabled={!writable}>
      <legend>One USB binding</legend>
      <p>Numeric firmware IDs and uint32 parameter cells only. Metadata validates both parameters; no alias or Unicode expansion.</p>
      <label>Layer<select aria-label="USB layer" bind:value={layer}>
        {#each selection.studio.layerIds as id, index}<option value={index}>{editor.draftKeymap?.layer_names?.[index] || 'Layer'} (ID {id})</option>{/each}
      </select></label>
      <label>Key position<select aria-label="USB key position" bind:value={position}>
        {#each selection.layout as _, index}<option value={index}>{index}</option>{/each}
      </select></label>
      <label>Behavior<select aria-label="USB behavior" bind:value={behavior}>
        {#each selection.studio.behaviors as item}<option value={item.id}>{item.displayName} (ID {item.id})</option>{/each}
      </select></label>
      <label>Parameter 1<input aria-label="Parameter 1" type="number" min="0" max="4294967295" step="1" bind:value={param1} /></label>
      <label>Parameter 2<input aria-label="Parameter 2" type="number" min="0" max="4294967295" step="1" bind:value={param2} /></label>
      <Button variant="accentOutline" disabled={!writable} onclick={writeBinding}>Write binding</Button>
    </fieldset>
    <p>Save and discard apply to all unsaved keyboard settings. Restore stock resets all Studio settings, not only the selected position.</p>
    <div class="usb-actions">
      <Button variant="outline" disabled={!writable || !status.dirty} onclick={() => void session.saveChanges()}>Save keyboard settings</Button>
      <Button variant="danger" disabled={!writable || !status.dirty} onclick={() => {
        if (window.confirm('Discard all unsaved keyboard settings and reload saved settings? Files are unchanged.')) void session.discardChanges()
      }}>Discard keyboard changes</Button>
      <Button variant="danger" disabled={!writable} onclick={restoreStock}>Restore stock</Button>
    </div>
  {/if}
</section>
