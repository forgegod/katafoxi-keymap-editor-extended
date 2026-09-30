<script lang="ts">
  import { editor } from '../editor.svelte.js'
  import HostLegendView from './HostLegendView.svelte'
  import LangFlag from './LangFlag.svelte'

  const chips = $derived(
    editor.hostAssemblies.map(assembly => ({
      id: assembly.id,
      label: editor.hostAssemblyLabel(assembly.view),
      parts: editor.hostAssemblyParts(assembly.view),
      active: editor.hostAssemblyActive(assembly.view)
    }))
  )
  const saved = $derived(editor.hostAssemblySaved())
  const blocked = $derived(editor.hostAssemblyRememberBlocked())
  const rememberTitle = $derived(
    saved
      ? 'This set is already remembered.'
      : blocked
        ? 'Three assemblies are remembered. Forget one to keep this set.'
        : 'Remember this set of languages and layouts.'
  )
</script>

<div class="assemblies" role="group" aria-label="Layout assemblies">
  <HostLegendView />
  {#each chips as chip (chip.id)}
    <span class="chip" class:on={chip.active}>
      <button
        type="button"
        class="show"
        aria-pressed={chip.active}
        aria-label={chip.label}
        title={chip.label}
        onclick={() => void editor.showHostAssembly(chip.id)}
      >
        {#each chip.parts as part, index (part.language)}
          {#if index > 0}<span class="plus" aria-hidden="true">{' + '}</span>{/if}
          <span class="part">
            <LangFlag language={part.language} alt="" />
            <span class="name">{part.layoutName}</span>
          </span>
        {/each}
      </button>
      <button
        type="button"
        class="forget"
        aria-label="Forget {chip.label}"
        title="Forget {chip.label}"
        onclick={() => void editor.forgetHostAssembly(chip.id)}
      >
        ×
      </button>
    </span>
  {/each}
  <button
    type="button"
    class="remember"
    disabled={saved || blocked}
    title={rememberTitle}
    onclick={() => void editor.rememberHostAssembly()}
  >
    Remember
  </button>
</div>

<style>
  .assemblies {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px;
    font-size: 12px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    max-width: 18rem;
    border: 1px solid #ccc;
    border-radius: 10px;
    background: #f3f3f3;
    color: #333;
  }

  .chip.on {
    background: #fff;
    border-color: #1d6f8a;
  }

  .show,
  .forget,
  .remember {
    margin: 0;
    border: 0;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .show {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 2px 1px 6px;
    max-width: 16rem;
    overflow: hidden;
    white-space: nowrap;
    color: inherit;
  }

  .part {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .part :global(img.flag) {
    width: 14px;
    height: 10px;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .plus {
    color: #888;
  }

  .forget {
    padding: 1px 7px 1px 2px;
    color: #777;
    line-height: 1;
  }

  .forget:hover {
    color: #222;
  }

  .remember {
    padding: 1px 2px;
    color: #1d6f8a;
  }

  .remember:hover:not(:disabled) {
    text-decoration: underline;
  }

  .remember:disabled {
    color: #999;
    cursor: default;
  }
</style>
