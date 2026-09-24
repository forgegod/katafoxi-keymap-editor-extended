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
  <span class="name">{label}</span>
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
    font-style: italic;
  }

  .github-link:hover,
  .github-link:focus-visible {
    color: #1a4fc4;
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

  .name {
    overflow: hidden;
    width: 0;
    height: 30px;
    line-height: 30px;
    white-space: nowrap;
  }

  .github-link:hover .name,
  .github-link:focus-visible .name {
    width: 210px;
    padding-right: 12px;
    transition: 0.15s ease-in;
  }
</style>
