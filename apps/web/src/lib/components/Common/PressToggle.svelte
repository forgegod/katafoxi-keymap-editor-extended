<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import type { Snippet } from 'svelte'

  /** Accent press-toggle: legend rail, AltGr column pills. */
  export type PressToggleDensity = 'rail' | 'bar' | 'pill'

  type Props = {
    pressed: boolean
    pale?: boolean
    density?: PressToggleDensity
    class?: string
    /** Bound HTML button when a parent needs the element (e.g. measure). */
    buttonEl?: HTMLButtonElement | undefined
    children?: Snippet
  } & Omit<HTMLButtonAttributes, 'class' | 'children' | 'aria-pressed'>

  let {
    pressed,
    pale = false,
    density = 'rail',
    class: className = '',
    buttonEl = $bindable(),
    children,
    type = 'button',
    disabled = false,
    ...rest
  }: Props = $props()
</script>

<button
  bind:this={buttonEl}
  {type}
  {disabled}
  class="press-toggle {className}"
  class:on={pressed}
  class:pale
  data-density={density}
  aria-pressed={pressed}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .press-toggle {
    box-sizing: border-box;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    margin: 0;
    padding: 0 6px;
    white-space: nowrap;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface-sunken);
    color: var(--text-muted);
    font: inherit;
    font-family: Quicksand, avenir, sans-serif;
    cursor: pointer;
  }

  .press-toggle[data-density='rail'] {
    width: 100%;
    height: 22px;
  }

  .press-toggle[data-density='bar'] {
    width: auto;
    height: 28px;
    margin: 2px 0 0;
    padding: 0 8px 0 7px;
    border-radius: 8px;
    justify-content: center;
    font-size: var(--font-xs);
    font-weight: 600;
  }

  .press-toggle[data-density='pill'] {
    width: auto;
    height: auto;
    padding: 1px 6px;
    border-radius: 10px;
    font-family: var(--glyph-font, Inter, 'Noto Sans', sans-serif);
    font-size: var(--font-sm);
  }

  .press-toggle:hover:not(:disabled):not(.on) {
    background: var(--surface);
    border-color: var(--accent);
    color: var(--accent);
  }

  .press-toggle.on {
    background: var(--surface);
    border-color: var(--accent);
    color: var(--accent);
  }

  .press-toggle[data-density='pill'].on {
    color: var(--text);
  }

  .press-toggle.pale,
  .press-toggle:disabled {
    background: var(--surface-sunken);
    border-color: var(--border-subtle);
    color: var(--text-muted);
    opacity: 0.45;
    cursor: default;
  }

  .press-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .press-toggle :global(img),
  .press-toggle :global(svg) {
    display: block;
    width: 14px;
    height: 14px;
    flex: none;
  }
</style>
