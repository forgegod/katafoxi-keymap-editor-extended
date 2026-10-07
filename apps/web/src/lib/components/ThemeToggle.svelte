<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from './Common/Icon.svelte'
  import {
    applyThemePreference,
    colorSchemeLabel,
    readColorScheme,
    themeToggleTitle,
    toggleColorScheme,
    type ColorScheme
  } from '../theme'

  let scheme = $state<ColorScheme>(readColorScheme())

  const iconName = $derived(scheme === 'light' ? 'sun' : 'moon')
  const label = $derived(colorSchemeLabel(scheme))
  const title = $derived(themeToggleTitle(scheme))

  function apply(next: ColorScheme) {
    scheme = next
    applyThemePreference(next)
  }

  function onClick() {
    apply(toggleColorScheme(scheme))
  }

  onMount(() => {
    // Sync dataset if the early <head> script and Svelte state ever diverge.
    applyThemePreference(scheme)
  })
</script>

<button
  type="button"
  class="theme-toggle"
  {title}
  aria-label="Color theme: {label}"
  data-scheme={scheme}
  onclick={onClick}
>
  <span class="icon-slot">
    <Icon name={iconName} />
  </span>
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    height: var(--chrome-h);
    padding: 0;
    margin: 0;
    border-radius: calc(var(--chrome-h) / 2);
    background-color: var(--surface);
    color: var(--accent);
    border: 1px solid var(--border-soft);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--shade) 6%, transparent);
    cursor: pointer;
    font: inherit;
  }

  .theme-toggle:hover,
  .theme-toggle:focus-visible {
    color: var(--accent-strong);
    border-color: var(--accent);
  }

  .theme-toggle:focus-visible {
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
