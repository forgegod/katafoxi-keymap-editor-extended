<script lang="ts">
  import Icon from './Common/Icon.svelte'

  interface Props {
    className?: string
  }

  let { className = 'github-link' }: Props = $props()
</script>

<a
  class={className}
  target="_blank"
  rel="noreferrer"
  href="https://github.com/nickcoutsos/keymap-editor"
>
  <Icon collection="brands" name="github" />/nickcoutsos/keymap-editor
</a>
