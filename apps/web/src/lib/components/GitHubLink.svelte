<script lang="ts">
  import Icon from './Common/Icon.svelte'

  const href = 'https://github.com/katafoxi/keymap-editor-extended'
  const label = 'keymap-editor-extended'
</script>

<a
  class="github-link"
  {href}
  target="_blank"
  rel="noreferrer"
  title="github.com/katafoxi/keymap-editor-extended"
  aria-label="{label} on GitHub"
>
  <span class="icon-slot">
    <Icon collection="brands" name="github" />
  </span>
</a>

<style>
  /* Lives in the top chrome band — never floats over the keyboard stage. */
  .github-link {
    position: absolute;
    z-index: 6;
    top: 6px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    height: var(--chrome-h);
    padding: 0;
    border-radius: calc(var(--chrome-h) / 2);
    background-color: var(--surface);
    color: var(--accent);
    text-decoration: none;
    font-size: 110%;
    border: 1px solid var(--border-soft);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--shade) 6%, transparent);
  }

  .github-link:hover,
  .github-link:focus-visible {
    color: var(--accent-strong);
    border-color: var(--accent);
  }

  .github-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .icon-slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--chrome-h);
    height: var(--chrome-h);
    flex-shrink: 0;
  }

  .icon-slot :global(.icon) {
    width: 0.95em;
    height: 0.95em;
  }
</style>
