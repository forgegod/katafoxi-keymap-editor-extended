<script lang="ts">
  import { editor } from '../editor.svelte.js'
  import Button from './Common/Button.svelte'
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
  {#each chips as chip (chip.id)}
    <span class="chip" class:on={chip.active} aria-current={chip.active ? 'true' : undefined}>
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
  <Button
    variant="accentOutline"
    class="remember"
    disabled={saved || blocked}
    title={rememberTitle}
    onclick={() => void editor.rememberHostAssembly()}
  >
    Remember
  </Button>
</div>

<style>
  .assemblies {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0 0 4px;
    min-height: 26px;
    font-size: var(--font-sm);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    max-width: 18rem;
    min-height: 26px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-sunken);
    color: var(--text-muted);
    box-shadow: none;
  }

  .chip.on {
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
    border-color: var(--accent);
    color: var(--accent-strong);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  }

  .show,
  .forget {
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
    padding: 2px 2px 2px 7px;
    max-width: 16rem;
    overflow: hidden;
    white-space: nowrap;
    color: inherit;
    font-weight: 500;
  }

  .chip.on .show {
    font-weight: 700;
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
    color: var(--text-muted);
  }

  .chip.on .plus {
    color: var(--accent);
  }

  .forget {
    padding: 2px 8px 2px 2px;
    color: var(--text-muted);
    line-height: 1;
  }

  .forget:hover {
    color: var(--text);
  }

  .chip.on .forget {
    color: var(--accent);
  }

  .chip.on .forget:hover {
    color: var(--accent-strong);
  }
</style>
