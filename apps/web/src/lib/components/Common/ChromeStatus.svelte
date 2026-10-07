<script lang="ts">
  /** Shared ZMK / Host lane status: short label always visible; warn wash when dirty. */
  let {
    dirty,
    label,
    title,
    class: className = ''
  }: {
    dirty: boolean
    /** Short chip text in both states (Changed / Saved). */
    label: string
    title: string
    class?: string
  } = $props()
</script>

<span
  class="chrome-status {className}"
  class:dirty
  class:clean={!dirty}
  aria-live="polite"
  aria-label={title}
  {title}
>
  <span class="status-dot" aria-hidden="true"></span>
  {label}
</span>

<style>
  .chrome-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    height: var(--chrome-h);
    padding: 0 8px 0 6px;
    border-radius: 5px;
    font-size: var(--font-md);
    font-weight: 600;
    white-space: nowrap;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  /* One pending colour for ZMK Draft and Host Changed. */
  .dirty {
    color: var(--warn);
    background: var(--warn-wash);
  }

  .clean {
    color: var(--ok);
    /* Keep the same padding as .dirty so the status dot does not shift. */
    background: var(--ok-wash);
  }
</style>
