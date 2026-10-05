<script lang="ts">
  import Modal from '../../Common/Modal.svelte'
  import Button from '../../Common/Button.svelte'

  interface Props {
    code: string
    /** True when navigator.clipboard.writeText already succeeded. */
    copied: boolean
    warnings?: string[]
    onClose: () => void
  }

  let { code, copied, warnings = [], onClose }: Props = $props()

  let note = $state('')
  let area: HTMLTextAreaElement | undefined = $state()

  $effect(() => {
    note = copied
      ? 'Copied to the system clipboard. Paste it into your config/*.keymap.'
      : 'Could not write the system clipboard — select the text below and copy manually.'
  })

  async function copyAgain() {
    try {
      await navigator.clipboard.writeText(code)
      note = 'Copied to the system clipboard. Paste it into your config/*.keymap.'
    } catch {
      note = 'Could not write the system clipboard — select the text below and copy manually.'
      area?.focus()
      area?.select()
    }
  }

  function selectAll() {
    area?.focus()
    area?.select()
  }
</script>

<Modal size="wide" onBackdrop={onClose}>
  <div class="clipboard-export" role="dialog" aria-modal="true" aria-label="Exported keymap">
    <h2 class="clipboard-export-title">.keymap ready</h2>
    <p class="clipboard-export-hint">
      Paste this into your firmware repo (for example
      <code>config/*.keymap</code>). Clipboard mode does not write files on disk.
    </p>
    {#if warnings.length > 0}
      <ul class="clipboard-export-warnings">
        {#each warnings as message}
          <li>{message}</li>
        {/each}
      </ul>
    {/if}
    <textarea
      class="clipboard-export-text"
      readonly
      spellcheck="false"
      wrap="off"
      bind:this={area}
      value={code}
    ></textarea>
    <p class="clipboard-export-note" role="status">{note}</p>
    <div class="clipboard-export-actions">
      <Button variant="accent" onclick={() => void copyAgain()}>Copy again</Button>
      <Button variant="outline" onclick={selectAll}>Select all</Button>
      <Button variant="outline" onclick={onClose}>Close</Button>
    </div>
  </div>
</Modal>

<style>
  .clipboard-export {
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-sizing: border-box;
    width: min(96vw, 1500px);
    min-width: min(40rem, 92vw);
    max-width: min(98vw, 1600px);
    height: min(82vh, 52rem);
    min-height: 28rem;
    max-height: min(94vh, 64rem);
    margin: 12px;
    padding: 16px 18px;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    resize: both;
    overflow: auto;
  }

  .clipboard-export-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .clipboard-export-hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.4;
  }

  .clipboard-export-hint code {
    font-size: 0.95em;
  }

  .clipboard-export-warnings {
    margin: 0;
    padding-left: 1.2em;
    color: var(--warn-ink, var(--text-muted));
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.35;
    flex-shrink: 0;
  }

  .clipboard-export-text {
    box-sizing: border-box;
    flex: 1 1 auto;
    width: 100%;
    min-height: 16rem;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg, var(--surface));
    color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.72rem;
    line-height: 1.4;
    white-space: pre;
    overflow: auto;
    resize: none;
  }

  .clipboard-export-note {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
    flex-shrink: 0;
  }

  .clipboard-export-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    flex-shrink: 0;
  }
</style>
