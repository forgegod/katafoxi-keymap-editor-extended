<script lang="ts">
  /** Shared ZMK / Host lane status: green dot when clean, warn-colored dot + word when pending. */
  let {
    dirty,
    label,
    title,
    class: className = ''
  }: {
    dirty: boolean
    /** Shown only while dirty (e.g. Draft, Changed). */
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
  {#if dirty}{label}{/if}
</span>
