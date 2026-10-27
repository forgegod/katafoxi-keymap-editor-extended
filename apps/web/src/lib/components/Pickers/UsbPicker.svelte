<script lang="ts">
  import { onDestroy } from 'svelte'
  import Button from '../Common/Button.svelte'
  import { UsbStudio, usbStudioAvailable, type UsbStudioStatus } from '../../usb-studio'
  import type { UsbKeyboardSelection } from '../../editor/types'
  import { editor } from '../../editor.svelte'

  let { onSelect, onUseClipboard }: { onSelect: (event: UsbKeyboardSelection) => Promise<boolean>; onUseClipboard: () => void } = $props()
  const available = usbStudioAvailable()
  let status = $state<UsbStudioStatus>({ state: available ? 'disconnected' : 'unavailable' })
  const session = new UsbStudio(event => onSelect(event), next => { status = next }, () => editor.captureUsbLoadGuard())
  onDestroy(() => session.disconnect())
</script>

<section aria-label="USB keyboard">
  <p role="status">{status.state[0].toUpperCase() + status.state.slice(1)}{status.deviceName ? ` · ${status.deviceName}` : ''}</p>
  {#if status.message}<p>{status.message}</p>{/if}
  {#if status.state === 'locked'}<p>Use the Studio Unlock key or combo on your keyboard to continue.</p>{/if}
  {#if !available}<p>Web Serial requires a supported browser and a secure context. Use Clipboard instead.</p>{/if}
  <Button variant="outline" disabled={!available || status.state === 'connecting'} onclick={() => void session.connect()}>Connect USB</Button>
  {#if status.state === 'connecting' || status.state === 'locked' || status.state === 'unlocked'}
    <Button variant="outline" onclick={() => session.disconnect()}>Disconnect USB</Button>
  {/if}
  <Button variant="outline" onclick={onUseClipboard}>Use Clipboard</Button>
</section>
