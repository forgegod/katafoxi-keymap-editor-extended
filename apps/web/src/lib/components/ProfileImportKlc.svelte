<script lang="ts">
  import Button from './Common/Button.svelte'
  import './ProfileImport.css'

  interface Props {
    importText?: string
    importError?: string
    importPaneEl?: HTMLDivElement | undefined
    onFile: (event: Event) => void
    onTextInput: () => void
    onSubmit: () => void
    onBack: () => void
  }

  let {
    importText = $bindable(''),
    importError = '',
    importPaneEl = $bindable(),
    onFile,
    onTextInput,
    onSubmit,
    onBack
  }: Props = $props()
</script>

<div
  class="profile-import"
  role="dialog"
  aria-modal="true"
  aria-label="Import klc"
  tabindex="-1"
  bind:this={importPaneEl}
>
  <input type="file" accept=".klc" aria-label="klc file" onchange={onFile} />
  <p class="profile-import-hint">
    A one-language file fills this column. A Caps Lock alphabet also fills that language.
  </p>
  <textarea
    aria-label="klc text"
    placeholder="Paste klc…"
    bind:value={importText}
    oninput={onTextInput}
  ></textarea>
  {#if importError}
    <p class="profile-import-error" role="alert">{importError}</p>
  {/if}
  <div class="profile-import-actions">
    <Button variant="accent" onclick={onSubmit}>Import</Button>
    <Button variant="outline" onclick={onBack}>Back</Button>
  </div>
</div>
