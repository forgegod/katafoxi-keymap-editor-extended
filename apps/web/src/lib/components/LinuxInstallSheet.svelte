<script lang="ts">
  import logoLinux from '../assets/logo-linux.png'
  import Modal from './Common/Modal.svelte'
  import Button from './Common/Button.svelte'
  import LayoutExportCard, { type LayoutExportItem } from './LayoutExportCard.svelte'
  import './HostInstallDialog.css'

  interface Props {
    exports: LayoutExportItem[]
    copyNote: string
    onCopyText: (text: string, okMessage: string, markDelivered?: boolean) => void
    onDownloadSection: (text: string, name: string) => void
    onDownloadAll: () => void
    onClose: () => void
  }

  let {
    exports,
    copyNote,
    onCopyText,
    onDownloadSection,
    onDownloadAll,
    onClose
  }: Props = $props()
</script>

<Modal onBackdrop={onClose} ariaLabelledby="linux-install-title">
  <div class="install-dialog">
    <header class="dialog-head">
      <img class="dialog-logo" src={logoLinux} alt="" width="28" height="28" />
      <div>
        <h2 id="linux-install-title">Install on Linux</h2>
        <p class="lede">
          This editor exports an <code>xkb_symbols</code> section to paste into an existing symbols
          file (or keep as a file). It is not a drop-in <code>.xkb</code> layout package.
        </p>
      </div>
    </header>

    <ol class="steps">
      <li>
        Only languages you changed appear below. Copy or download each section, then paste it into
        the recommended symbols file for that language.
      </li>
      <li>
        Prefer the symbols module and variant shown on each card — short files near the top of the
        list are easier to find and keep the layout picker uncluttered.
      </li>
      <li>
        Saving under <code>/usr/share/X11/xkb/symbols/</code> usually needs
        <code>sudo</code>. A user copy under <code>~/.xkb/symbols/</code> may avoid that, but still
        needs to be wired into your XKB rules.
      </li>
      <li>
        Enable the variant in desktop keyboard settings, then re-login if it does not appear.
      </li>
    </ol>

    {#if exports.length === 0}
      <p class="empty-exports" role="status">
        No custom host layout yet. Alt+click a key to edit symbols, then copy or download a section
        here.
      </p>
    {/if}

    {#each exports as item (item.layoutId)}
      <LayoutExportCard {item} {onCopyText} {onDownloadSection} />
    {/each}

    {#if exports.length > 1}
      <div class="row-actions bulk">
        <Button variant="outline" onclick={onDownloadAll}>Download all sections</Button>
      </div>
    {/if}

    {#if copyNote}
      <p class="copy-note" role="status">{copyNote}</p>
    {/if}

    <div class="dialog-foot">
      <Button variant="outline" onclick={onClose}>Close</Button>
    </div>
  </div>
</Modal>
