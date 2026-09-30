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
  .github-link {
    position: absolute;
    z-index: 4;
    bottom: 5px;
    left: 5px;
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0;
    border-radius: 15px;
    background-color: white;
    color: royalblue;
    text-decoration: none;
    font-size: 110%;
  }

  .github-link:hover,
  .github-link:focus-visible {
    color: #1a4fc4;
  }

  .github-link:focus-visible {
    outline: 2px solid #1d6f8a;
    outline-offset: 2px;
  }

  .icon-slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
  }

  .icon-slot :global(.icon) {
    width: 0.95em;
    height: 0.95em;
  }

</style>
