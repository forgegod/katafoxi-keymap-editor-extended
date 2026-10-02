<script lang="ts">
  import {
    loadClipboardBundle,
    type ClipboardBundle
  } from '../../../clipboard/load'
  import Button from '../../Common/Button.svelte'

  interface KeymapEvent {
    source?: string
    layout?: unknown
    keymap?: unknown
    clipboardOriginalSource?: string | null
    clipboardInferredLayout?: boolean
    warnings?: string[]
    [key: string]: unknown
  }

  interface Props {
    onSelect: (event: KeymapEvent) => void
  }

  let { onSelect }: Props = $props()

  let infoText = $state('')
  let keymapText = $state('')
  /** When the keymap field is keymap.json, paste the matching .keymap here for Copy splice. */
  let exportKeymapText = $state('')
  let error = $state<string | null>(null)
  let loadedKeyboard = $state<string | null>(null)
  let busy = $state(false)

  function errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'errors' in err) {
      const list = (err as { errors: unknown }).errors
      if (Array.isArray(list) && list.every(item => typeof item === 'string')) {
        return list.join('; ')
      }
    }
    return err instanceof Error ? err.message : 'Failed to load clipboard keymap'
  }

  function emitBundle(bundle: ClipboardBundle) {
    loadedKeyboard = bundle.inferredLayout
      ? `${bundle.keyboard} (inferred)`
      : bundle.keyboard
    onSelect({
      source: 'clipboard',
      layout: bundle.layout,
      keymap: bundle.keymap,
      clipboardOriginalSource: bundle.originalSource,
      clipboardInferredLayout: bundle.inferredLayout,
      warnings: bundle.warnings
    })
  }

  function load() {
    error = null
    busy = true
    try {
      const bundle = loadClipboardBundle(
        infoText,
        keymapText,
        exportKeymapText.trim() ? exportKeymapText : undefined
      )
      emitBundle(bundle)
    } catch (err) {
      error = errorMessage(err)
      loadedKeyboard = null
    } finally {
      busy = false
    }
  }

  async function pasteInto(
    field: 'info' | 'keymap' | 'export',
    event: MouseEvent
  ) {
    event.preventDefault()
    error = null
    try {
      const text = await navigator.clipboard.readText()
      if (field === 'info') infoText = text
      else if (field === 'keymap') keymapText = text
      else exportKeymapText = text
    } catch {
      error = 'Could not read the clipboard — paste into the field manually'
    }
  }

  const canLoad = $derived(keymapText.trim().length > 0)
  const keymapLooksJson = $derived(keymapText.trim().startsWith('{'))
</script>

<div class="clipboard-picker">
  <p class="clipboard-hint">
    Paste a ZMK <code>.keymap</code> to start. <code>info.json</code> is
    optional — without it the board is a flat rectangle in binding order.
    Then <strong>Copy .keymap</strong> and paste back into your firmware repo.
  </p>

  <label class="clipboard-field">
    <span class="clipboard-field-head">
      <span>Keymap · .keymap</span>
      <Button
        variant="outline"
        class="clipboard-paste"
        title="Paste from system clipboard"
        onclick={event => void pasteInto('keymap', event)}
      >
        Paste
      </Button>
    </span>
    <textarea
      class="clipboard-text"
      rows="8"
      spellcheck="false"
      placeholder="Paste your board .keymap (preferred). keymap.json also loads for editing."
      bind:value={keymapText}
    ></textarea>
  </label>

  <label class="clipboard-field">
    <span class="clipboard-field-head">
      <span>Layout · info.json (optional)</span>
      <Button
        variant="outline"
        class="clipboard-paste"
        title="Paste from system clipboard"
        onclick={event => void pasteInto('info', event)}
      >
        Paste
      </Button>
    </span>
    <textarea
      class="clipboard-text"
      rows="4"
      spellcheck="false"
      placeholder={'Optional. Without it: rectangular board from binding count.\n{\n  "id": "…",\n  "layouts": { "LAYOUT": { "layout": [ … ] } }\n}'}
      bind:value={infoText}
    ></textarea>
  </label>

  {#if keymapLooksJson}
    <label class="clipboard-field">
      <span class="clipboard-field-head">
        <span>Export source · .keymap</span>
        <Button
          variant="outline"
          class="clipboard-paste"
          title="Paste .keymap from system clipboard"
          onclick={event => void pasteInto('export', event)}
        >
          Paste
        </Button>
      </span>
      <p class="clipboard-field-note">
        You pasted keymap.json. Add the matching .keymap here so Copy can splice
        into it instead of regenerating a bare template.
      </p>
      <textarea
        class="clipboard-text"
        rows="5"
        spellcheck="false"
        placeholder="Paste the matching board .keymap from your firmware repo"
        bind:value={exportKeymapText}
      ></textarea>
    </label>
  {/if}

  <div class="clipboard-actions">
    <Button
      variant="accent"
      disabled={!canLoad || busy}
      onclick={load}
      title="Parse the pasted keymap (and layout if provided)"
    >
      {busy ? 'Loading…' : 'Load'}
    </Button>
    {#if loadedKeyboard}
      <span class="clipboard-loaded" title="Loaded into the editor">
        Loaded · {loadedKeyboard}
      </span>
    {/if}
  </div>

  {#if error}
    <p class="clipboard-error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .clipboard-picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .clipboard-hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.35;
  }

  .clipboard-hint code,
  .clipboard-hint strong {
    font-size: 0.95em;
  }

  .clipboard-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: var(--font-sm, 0.85rem);
  }

  .clipboard-field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .clipboard-field-note {
    margin: 0;
    color: var(--warn-ink, var(--text-muted));
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.35;
  }

  .clipboard-picker :global(.clipboard-paste) {
    height: 1.6rem;
    padding: 0 6px;
    font-size: var(--font-sm, 0.85rem);
  }

  .clipboard-text {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    margin: 0;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.78rem;
    line-height: 1.35;
    resize: vertical;
  }

  .clipboard-text:focus {
    outline: none;
    border-color: var(--accent);
  }

  .clipboard-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .clipboard-loaded {
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
  }

  .clipboard-error {
    margin: 0;
    color: var(--danger-ink, var(--danger, #c44));
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.35;
  }
</style>
