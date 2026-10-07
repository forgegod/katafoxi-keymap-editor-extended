<script lang="ts">
  import { hostLanguage, isHostLanguageId } from '@keymap-editor/keymap-core'

  interface Props {
    language: string
    /** Accessible name. Leave empty when a parent control already names the language. */
    alt?: string
  }

  let { language, alt = '' }: Props = $props()

  const code = $derived(isHostLanguageId(language) ? hostLanguage(language).flagCode : null)
  const src = $derived(code ? `${import.meta.env.BASE_URL}flags/${code}.svg` : null)
</script>

{#if src}
  <img class="flag" src={src} {alt} width="20" height="15" draggable="false" />
{:else}
  <span class="missing" aria-hidden="true">—</span>
{/if}

<style>
  .flag {
    display: block;
    width: 20px;
    height: 15px;
    object-fit: cover;
    border-radius: 1px;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--paper-shade) 28%, transparent);
  }
</style>
