<script lang="ts">
  import * as config from '../../config'
  import { loadLayout } from '../../api'
  import { loadKeymap } from '../../api'
  import { githubChipLabel, githubGateAction } from '../../github/chrome-label.js'
  import github from '../../github/api.svelte.js'
  import { compact } from '../../utils'
  import { readStoredDemoId, DEMO_CATALOG } from '../../demo/catalog'
  import Selector from '../Common/Selector.svelte'
  import GithubPicker, { type GithubChromeStatus } from './Github/Picker.svelte'
  import DemoPicker from './Demo/Picker.svelte'
  import SourceMenu from './SourceMenu.svelte'

  interface KeymapEvent {
    source?: string
    layout?: unknown
    keymap?: unknown
    github?: { repository: string; branch: string }
    demo?: { id: string; name: string }
    [key: string]: unknown
  }

  interface Props {
    onSelect: (event: KeymapEvent) => void
    onLogout?: () => void
  }

  let { onSelect, onLogout }: Props = $props()

  const sourceChoices = compact([
    { id: 'demo', name: 'Demo' },
    config.enableLocal ? { id: 'local', name: 'Local' } : null,
    config.enableGitHub ? { id: 'github', name: 'GitHub' } : null
  ])

  const selectedSource = localStorage.getItem('selectedSource')
  const onlySource = sourceChoices.length === 1 ? sourceChoices[0].id : null
  const storedIsChoice = Boolean(
    selectedSource && sourceChoices.some(source => source.id === selectedSource)
  )
  /** Cold start with no remembered source: land on Demo and open the picker once. */
  const firstVisit = !selectedSource
  const defaultSource =
    onlySource ||
    (storedIsChoice
      ? selectedSource
      : selectedSource
        ? null
        : (sourceChoices.find(source => source.id === 'demo')?.id ?? null))

  let source = $state<string | null>(defaultSource)
  let menuOpen = $state(firstVisit && defaultSource === 'demo')
  let demoAccent = $state(firstVisit && defaultSource === 'demo')
  let gh = $state<GithubChromeStatus | null>(null)
  let demoName = $state<string | null>(
    DEMO_CATALOG.find(entry => entry.id === readStoredDemoId())?.name ?? null
  )

  const gate = $derived(
    source === 'github'
      ? githubGateAction({
          onlySource: sourceChoices.length === 1,
          ready: gh?.ready ?? false,
          authorized: gh?.authorized ?? false,
          appInstalled: gh?.appInstalled ?? false
        })
      : null
  )

  const triggerLabel = $derived.by(() => {
    if (source === 'local') return 'Local'
    if (source === 'demo') return demoName ? `Demo · ${demoName}` : 'Demo'
    if (source !== 'github') return 'Source'
    if (gate === 'login') return 'Login with GitHub'
    if (gate === 'install') return 'Add Repository'
    if (!gh?.ready || !gh.authorized || !gh.appInstalled) return 'GitHub'
    return githubChipLabel(gh.repoFullName, gh.repoFullNames, gh.branch)
  })

  const triggerTitle = $derived.by(() => {
    if (source === 'local') return 'Local files'
    if (source === 'demo') {
      return demoName
        ? `Demo keyboard: ${demoName}`
        : 'Choose a demo keyboard'
    }
    if (source !== 'github') return 'Choose a keymap source'
    if (!gh?.ready || !gh.authorized) return 'Login with GitHub'
    if (!gh.appInstalled) return 'Add a GitHub repository'
    if (gh.repoFullName && gh.branch) return `${gh.repoFullName} · ${gh.branch}`
    if (gh.repoFullName) return gh.repoFullName
    return 'GitHub'
  })

  function runGate() {
    if (gate === 'login') github.beginLoginFlow()
    else if (gate === 'install') github.beginInstallAppFlow()
  }

  function handleKeyboardSelected(event: KeymapEvent) {
    const { layout, keymap, ...rest } = event
    if (!keymap || typeof keymap !== 'object') return

    const km = keymap as {
      layer_names?: string[]
      layers: unknown[]
    }
    const layerNames =
      km.layer_names || km.layers.map((_, i) => `Layer ${i}`)
    Object.assign(km, { layer_names: layerNames })

    if (event.demo?.name) demoName = event.demo.name

    onSelect({ source: source ?? undefined, layout, keymap: km, ...rest })
  }

  async function fetchLocalKeyboard() {
    const [layout, keymap] = await Promise.all([loadLayout(), loadKeymap()])
    handleKeyboardSelected({ source: source ?? undefined, layout, keymap })
  }

  function connectGithub() {
    source = 'github'
  }

  $effect(() => {
    const src = source
    if (src) localStorage.setItem('selectedSource', src)
    if (src === 'local') {
      fetchLocalKeyboard()
    }
  })

  $effect(() => {
    if (!menuOpen && demoAccent) demoAccent = false
  })
</script>

<div class="source-fields">
  {#if sourceChoices.length === 1 && source === 'local'}
    <span class="local-source" title="Local files">Local</span>
  {:else}
    <SourceMenu
      label={triggerLabel}
      title={triggerTitle}
      busy={source === 'github' && !!gh?.loading}
      accent={demoAccent}
      popup={gate === null}
      bind:open={menuOpen}
      onActivate={runGate}
    >
      {#if sourceChoices.length > 1}
        <div class="source-select" class:source-select-accent={demoAccent && source === 'demo'}>
          <Selector
            id="source"
            label="Source"
            value={source}
            choices={sourceChoices}
            onUpdate={value => {
              source = String(value)
            }}
          />
        </div>
      {/if}
      {#if source === 'demo'}
        <DemoPicker
          onSelect={handleKeyboardSelected}
          onConnectGithub={config.enableGitHub ? connectGithub : undefined}
          showGithubCta={config.enableGitHub}
        />
      {/if}
      {#if source === 'github'}
        <GithubPicker
          embedded
          onSelect={handleKeyboardSelected}
          onStatus={status => (gh = status)}
          {onLogout}
        />
      {/if}
    </SourceMenu>
  {/if}
</div>

<style>
  .source-fields {
    display: flex;
    align-items: center;
  }

  .local-source {
    display: inline-flex;
    align-items: center;
    height: var(--chrome-h);
    color: var(--text);
    font-size: var(--font-md);
  }

  .source-select {
    width: 100%;
  }

  .source-select-accent :global(.control select) {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  }

  .source-select-accent :global(label) {
    color: var(--accent);
  }
</style>
