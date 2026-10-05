<script lang="ts">
  import {
    recommendedXkbInstallTarget,
    type HostLanguageId,
    type XkbInstallTarget
  } from '@keymap-editor/keymap-core'
  import Button from './Common/Button.svelte'
  import LangFlag from './LangFlag.svelte'
  import './HostInstallDialog.css'

  export type LayoutExportItem = {
    layoutId: string
    language: HostLanguageId
    languageName: string
    name: string
    text: string
  }

  interface Props {
    item: LayoutExportItem
    onCopyText: (text: string, okMessage: string, markDelivered?: boolean) => void
    onDownloadSection: (text: string, name: string) => void
  }

  let { item, onCopyText, onDownloadSection }: Props = $props()

  const target: XkbInstallTarget = $derived(recommendedXkbInstallTarget(item.language))
</script>

<section class="layout-card">
  <h3>
    <span class="flag" aria-hidden="true"><LangFlag language={item.language} /></span>
    {item.languageName}
    <span class="profile-name">“{item.name}”</span>
    <span class="module"
      >symbols/{target.module}{target.variant ? ` · ${target.variant}` : ''}</span
    >
  </h3>

  {#if target.tip}
    <p class="card-tip">{target.tip}</p>
  {/if}

  <label class="path-label" for={`sys-path-${item.layoutId}`}>Example system path</label>
  <div class="path-row">
    <input
      id={`sys-path-${item.layoutId}`}
      class="path-input"
      readonly
      value={target.systemPath}
    />
    <Button variant="outline" onclick={() => onCopyText(target.systemPath, 'System path copied')}>
      Copy path
    </Button>
  </div>

  <label class="path-label" for={`user-path-${item.layoutId}`}>Example user path</label>
  <div class="path-row">
    <input
      id={`user-path-${item.layoutId}`}
      class="path-input"
      readonly
      value={target.userPath}
    />
    <Button variant="outline" onclick={() => onCopyText(target.userPath, 'User path copied')}>
      Copy path
    </Button>
  </div>

  <pre class="section-preview">{item.text}</pre>
  <div class="row-actions">
    <Button
      variant="accent"
      onclick={() => onCopyText(item.text, `Section “${item.name}” copied`, true)}
    >
      Copy section
    </Button>
    <Button variant="outline" onclick={() => onDownloadSection(item.text, item.name)}>
      Download file
    </Button>
  </div>
</section>
