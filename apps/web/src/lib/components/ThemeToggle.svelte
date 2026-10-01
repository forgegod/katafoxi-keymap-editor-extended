<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from './Common/Icon.svelte'
  import {
    applyThemePreference,
    cycleThemePreference,
    readThemePreference,
    resolveColorScheme,
    themePreferenceLabel,
    themeToggleTitle,
    type ThemePreference
  } from '../theme'

  let preference = $state<ThemePreference>(readThemePreference())

  const iconName = $derived(
    preference === 'light' ? 'sun' : preference === 'dark' ? 'moon' : 'desktop'
  )
  const label = $derived(themePreferenceLabel(preference))
  const title = $derived(themeToggleTitle(preference))

  function apply(next: ThemePreference) {
    preference = next
    applyThemePreference(next)
  }

  function onClick() {
    apply(cycleThemePreference(preference))
  }

  onMount(() => {
    // Sync dataset if the early <head> script and Svelte state ever diverge.
    applyThemePreference(preference)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (preference !== 'system') return
      applyThemePreference('system')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  })
</script>

<button
  type="button"
  class="theme-toggle"
  {title}
  aria-label="Color theme: {label}"
  data-preference={preference}
  data-scheme={resolveColorScheme(preference)}
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
