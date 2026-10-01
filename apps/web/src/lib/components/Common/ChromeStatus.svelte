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
