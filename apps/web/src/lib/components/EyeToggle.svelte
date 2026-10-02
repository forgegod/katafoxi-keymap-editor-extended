<script lang="ts">
  interface Props {
    on: boolean
    label: string
    onclick: () => void
    disabled?: boolean
    /** Stable hook for the first-visit coach tour. */
    dataTour?: string
  }

  let { on, label, onclick, disabled = false, dataTour }: Props = $props()
</script>

<button
  type="button"
  class="eye"
  class:off={!on}
  aria-pressed={on}
  aria-label={label}
  data-tour={dataTour}
  {disabled}
  {onclick}
>
  <!-- Stroke glyphs so light/dark both inherit --text-muted / hover --text. -->
  <svg class="eye-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <g
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {#if on}
        <path
          d="M2.8 12s3.4-6.5 9.2-6.5S21.2 12 21.2 12s-3.4 6.5-9.2 6.5S2.8 12 2.8 12Z"
        />
        <circle cx="12" cy="12" r="2.75" />
      {:else}
        <path d="M3.5 3.5 20.5 20.5" />
        <path
          d="M10.2 5.5A10 10 0 0 1 12 5.5c5.8 0 9.2 6.5 9.2 6.5a15 15 0 0 1-2.1 2.6M6.5 6.7C4.3 8.2 2.8 10.5 2.8 12s3.4 6.5 9.2 6.5c1.5 0 2.9-.4 4.1-1"
        />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      {/if}
    </g>
  </svg>
</button>

<style>
  .eye {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 1px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    line-height: 0;
  }

  .eye:hover:not(:disabled) {
    background: var(--shade-wash-soft);
    color: var(--text);
  }

  .eye:disabled {
    cursor: default;
  }

  .eye.off {
    opacity: 0.55;
  }

  .eye-icon {
    display: block;
    width: 16px;
    height: 16px;
    flex: none;
  }
</style>
