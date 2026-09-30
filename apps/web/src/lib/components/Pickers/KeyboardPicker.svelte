<script lang="ts">
  import * as config from '../../config'
  import { loadLayout } from '../../api'
  import { loadKeymap } from '../../api'
  import { githubChipLabel, githubGateAction } from '../../github/chrome-label.js'
  import github from '../../github/api.svelte.js'
  import { compact } from '../../utils'
  import Selector from '../Common/Selector.svelte'
  import GithubPicker, { type GithubChromeStatus } from './Github/Picker.svelte'
  import SourceMenu from './SourceMenu.svelte'

  interface KeymapEvent {
    source?: string
    layout?: unknown
    keymap?: unknown
    github?: { repository: string; branch: string }
    [key: string]: unknown
  }

  interface Props {
    onSelect: (event: KeymapEvent) => void
    onLogout?: () => void
  }

  let { onSelect, onLogout }: Props = $props()

  const sourceChoices = compact([
    config.enableLocal ? { id: 'local', name: 'Local' } : null,
    config.enableGitHub ? { id: 'github', name: 'GitHub' } : null
  ])

  const selectedSource = localStorage.getItem('selectedSource')
  const onlySource = sourceChoices.length === 1 ? sourceChoices[0].id : null
  const defaultSource =
    onlySource ||
    (sourceChoices.find(source => source.id === selectedSource)
      ? selectedSource
      : null)

  let source = $state<string | null>(defaultSource)
  let gh = $state<GithubChromeStatus | null>(null)

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
    if (source !== 'github') return 'Source'
    if (gate === 'login') return 'Login with GitHub'
    if (gate === 'install') return 'Add Repository'
    if (!gh?.ready || !gh.authorized || !gh.appInstalled) return 'GitHub'
    return githubChipLabel(gh.repoFullName, gh.repoFullNames, gh.branch)
  })

  const triggerTitle = $derived.by(() => {
    if (source === 'local') return 'Local files'
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

    onSelect({ source: source ?? undefined, layout, keymap: km, ...rest })
  }

  async function fetchLocalKeyboard() {
    const [layout, keymap] = await Promise.all([loadLayout(), loadKeymap()])
    handleKeyboardSelected({ source: source ?? undefined, layout, keymap })
  }

  $effect(() => {
    const src = source
    if (src) localStorage.setItem('selectedSource', src)
    if (src === 'local') {
      fetchLocalKeyboard()
    }
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
      popup={gate === null}
      onActivate={runGate}
    >
      {#if sourceChoices.length > 1}
        <Selector
          id="source"
          label="Source"
          value={source}
          choices={sourceChoices}
          onUpdate={value => {
            source = String(value)
          }}
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
    height: 26px;
    color: var(--text);
    font-size: 13px;
  }
</style>
