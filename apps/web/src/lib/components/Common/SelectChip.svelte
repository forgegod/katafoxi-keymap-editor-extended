<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import type { Snippet } from 'svelte'

  /**
   * Key-editor selection chip (behaviour / taxonomy).
   * Active fill is selection green — not chrome teal.
   */
  type Props = {
    active?: boolean
    instant?: boolean
    attention?: boolean
    class?: string
    children?: Snippet
  } & Omit<HTMLButtonAttributes, 'class' | 'children'>

  let {
    active = false,
    instant = false,
    attention = false,
    class: className = '',
    children,
    type = 'button',
    ...rest
  }: Props = $props()
</script>

<button
  {type}
  class="select-chip key-editor-chip {className}"
  class:active
  class:instant
  class:attention
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .select-chip {
    cursor: pointer;
    flex-shrink: 0;
    border: 1px solid var(--border-soft);
    background: var(--key-face);
    color: var(--text);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: inherit;
    font-size: var(--font-xs);
    font-weight: 500;
    white-space: nowrap;
  }

  .select-chip.active {
    background: var(--hover-selection);
    border-color: var(--hover-selection);
    color: var(--on-accent);
  }

  .select-chip.attention {
    animation: key-needed 1s ease;
  }

  @keyframes key-needed {
    0%,
    100% {
      background: var(--key-face);
      border-color: var(--border-soft);
      color: var(--text);
    }
    18%,
    42% {
      background: var(--amber);
      border-color: var(--amber-strong);
      color: var(--amber-ink);
    }
    62% {
      background: var(--amber-soft);
      border-color: var(--amber-strong);
      color: var(--amber-ink);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .select-chip.attention {
      animation: none;
      background: var(--amber);
      border-color: var(--amber-strong);
      color: var(--amber-ink);
    }
  }

  .select-chip.instant {
    border-style: dashed;
  }

  .select-chip.instant.active {
    border-style: dashed;
  }

  .select-chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
