<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import type { Snippet } from 'svelte'

  /**
   * Semantic chrome / dialog button.
   * Color intents (do not collapse):
   * - publish + ready → solid green (Commit / Write files only)
   * - softReady + ready → green wash (Linux / Windows install)
   * - accent / accentOutline → teal (dialogs, Remember)
   * - danger → danger outline (Discard draft)
   * - outline / icon → chrome outline (default, Undo/Redo)
   */
  export type ButtonVariant =
    | 'outline'
    | 'publish'
    | 'softReady'
    | 'danger'
    | 'accent'
    | 'accentOutline'
    | 'icon'

  type Props = {
    variant?: ButtonVariant
    /** Gates publish (solid green) and softReady (green wash). */
    ready?: boolean
    class?: string
    children?: Snippet
  } & Omit<HTMLButtonAttributes, 'class' | 'children'>

  let {
    variant = 'outline',
    ready = false,
    class: className = '',
    children,
    type = 'button',
    disabled = false,
    ...rest
  }: Props = $props()
</script>

<button
  {type}
  {disabled}
  class="ui-btn {className}"
  class:ready
  data-variant={variant}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .ui-btn {
    cursor: pointer;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: var(--chrome-h);
    margin: 0;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-family: Quicksand, avenir, sans-serif;
    font-size: var(--font-md);
    font-weight: 500;
    line-height: 1;
  }

  .ui-btn:hover:not(:disabled) {
    background: var(--surface);
    border-color: var(--accent);
    color: var(--accent);
  }

  .ui-btn:disabled {
    background: var(--surface-sunken);
    color: var(--text-disabled);
    border-color: var(--border-subtle);
    cursor: not-allowed;
  }

  .ui-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  /* Commit / Write — solid green only when ready. */
  .ui-btn[data-variant='publish'].ready:not(:disabled) {
    background: var(--selection);
    color: var(--on-accent);
    border-color: transparent;
  }

  .ui-btn[data-variant='publish'].ready:hover:not(:disabled) {
    background: var(--ok-fill-strong);
    color: var(--on-accent);
  }

  .ui-btn[data-variant='publish'].ready:disabled {
    background: var(--hover-selection);
    color: var(--on-accent);
    border-color: transparent;
    opacity: 0.7;
  }

  /* Host install — wash while a user layout is waiting. */
  .ui-btn[data-variant='softReady'].ready:not(:disabled) {
    background: var(--ok-wash);
    border-color: var(--ok);
    color: var(--ok);
  }

  .ui-btn[data-variant='softReady'].ready:hover:not(:disabled) {
    background: var(--surface);
    border-color: var(--ok-strong);
    color: var(--ok-strong);
  }

  .ui-btn[data-variant='danger'] {
    background: transparent;
    color: var(--danger-ink);
    border-color: var(--danger-border);
    border-radius: 5px;
    box-shadow: none;
  }

  .ui-btn[data-variant='danger']:hover:not(:disabled) {
    background: var(--danger-wash);
    border-color: var(--danger-border);
    color: var(--danger-ink);
  }

  .ui-btn[data-variant='danger']:disabled {
    background: transparent;
    color: var(--text-disabled);
    border-color: var(--border-soft);
  }

  /* Dialog filled teal. */
  .ui-btn[data-variant='accent'] {
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: var(--on-accent);
  }

  .ui-btn[data-variant='accent']:hover:not(:disabled) {
    filter: brightness(1.05);
    border: 0;
    color: var(--on-accent);
  }

  .ui-btn[data-variant='accent']:disabled {
    opacity: 0.5;
    background: var(--accent);
    color: var(--on-accent);
    border: 0;
  }

  /* Remember / outline accent CTA. */
  .ui-btn[data-variant='accentOutline'] {
    min-height: 26px;
    height: auto;
    padding: 0 10px;
    border-color: var(--accent);
    border-radius: 8px;
    background: var(--surface);
    color: var(--accent);
    font-weight: 600;
  }

  .ui-btn[data-variant='accentOutline']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border-color: var(--accent-strong);
    color: var(--accent-strong);
  }

  .ui-btn[data-variant='accentOutline']:disabled {
    background: var(--surface-sunken);
    border-color: var(--border-subtle);
    color: var(--text-disabled);
  }

  /* Undo / Redo square. */
  .ui-btn[data-variant='icon'] {
    width: var(--chrome-h);
    padding: 0;
  }

  .ui-btn[data-variant='icon']:hover:not(:disabled) {
    background: var(--surface-sunken);
  }

  .ui-btn[data-variant='icon']:disabled {
    color: var(--text-disabled);
  }

  .ui-btn[data-variant='icon'] :global(svg) {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Soft-ready resting state matches outline; sunken when used as download idle. */
  .ui-btn[data-variant='softReady']:not(.ready) {
    background: var(--surface-sunken);
  }

  .ui-btn[data-variant='softReady']:not(.ready):hover:not(:disabled) {
    background: var(--surface);
  }
</style>
