<script lang="ts">
  import Button from './Common/Button.svelte'
  import './ProfileImport.css'

  type XkbSectionChoice = { section: string; name: string }

  interface Props {
    importText?: string
    importSections?: XkbSectionChoice[]
    importSection?: string
    importError?: string
    importPaneEl?: HTMLDivElement | undefined
    onFile: (event: Event) => void
    onTextInput: () => void
    onSectionChange: (section: string) => void
    onSubmit: () => void
    onBack: () => void
  }

  let {
    importText = $bindable(''),
    importSections = [],
    importSection = $bindable(''),
    importError = '',
    importPaneEl = $bindable(),
    onFile,
    onTextInput,
    onSectionChange,
    onSubmit,
    onBack
  }: Props = $props()
</script>

<div
  class="profile-import"
  role="dialog"
  aria-modal="true"
  aria-label="Import xkb"
  tabindex="-1"
  bind:this={importPaneEl}
>
  <input type="file" aria-label="xkb file" onchange={onFile} />
  <p class="profile-import-hint">
    xkb symbol files often have no extension, for example au or ru.
  </p>
  <textarea
    aria-label="xkb text"
    placeholder="Paste xkb…"
    bind:value={importText}
    oninput={onTextInput}
  ></textarea>
  {#if importSections.length > 1}
    <select
      aria-label="xkb section"
      value={importSection}
      onchange={event => onSectionChange(event.currentTarget.value)}
    >
      {#each importSections as item (item.section)}
        <option value={item.section}>{item.name}</option>
      {/each}
    </select>
  {/if}
  {#if importError}
    <p class="profile-import-error" role="alert">{importError}</p>
  {/if}
  <div class="profile-import-actions">
    <Button variant="accent" onclick={onSubmit}>Import</Button>
    <Button variant="outline" onclick={onBack}>Back</Button>
  </div>
</div>
