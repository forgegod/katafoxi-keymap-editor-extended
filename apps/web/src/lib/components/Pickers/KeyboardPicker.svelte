<script lang="ts">
  import type { ParsedKeymap } from '@keymap-editor/keymap-core'
  import * as config from '../../config'
  import { loadLayout } from '../../api'
  import { loadKeymap } from '../../api'
  import { githubChipLabel, githubGateAction } from '../../github/chrome-label.js'
  import github from '../../github/api.svelte.js'
  import { compact } from '../../utils'
  import { readStoredDemoId, DEMO_CATALOG } from '../../demo/catalog'
  import type {
    KeyboardSelection,
    KeyboardSelectionSource,
    KeymapPickerPayload
  } from '../../editor/types'
  import GithubPicker, { type GithubChromeStatus } from './Github/Picker.svelte'
  import DemoPicker from './Demo/Picker.svelte'
  import ClipboardPicker from './Clipboard/Picker.svelte'
  import SourceMenu from './SourceMenu.svelte'

  const SOURCE_BLURBS: Record<KeyboardSelectionSource, string> = {
    demo: 'Try a sample keyboard',
    clipboard: 'Paste .keymap · no login',
    github: 'Commit to your firmware repo',
    local: 'Dev sibling zmk-config'
  }

  /** Outgoing selection for App → editor.selectKeyboard. */
  type KeymapEvent = KeyboardSelection

  interface Props {
    onSelect: (event: KeymapEvent) => void
    onLogout?: () => void
    /** Switch source and open the menu (coach-tour / Demo CTAs). */
    openSource?: string | null
    onOpenSourceConsumed?: () => void
  }

  let { onSelect, onLogout, openSource = null, onOpenSourceConsumed }: Props =
    $props()

  const sourceChoices = compact([
    { id: 'demo' as const, name: 'Demo', blurb: SOURCE_BLURBS.demo },
    { id: 'clipboard' as const, name: 'Clipboard', blurb: SOURCE_BLURBS.clipboard },
    config.enableLocal
      ? { id: 'local' as const, name: 'Local', blurb: SOURCE_BLURBS.local }
      : null,
    config.enableGitHub
      ? { id: 'github' as const, name: 'GitHub', blurb: SOURCE_BLURBS.github }
      : null
  ])

  const selectedSource = localStorage.getItem('selectedSource')
  const onlySource = sourceChoices.length === 1 ? sourceChoices[0].id : null
  const storedIsChoice = Boolean(
    selectedSource && sourceChoices.some(source => source.id === selectedSource)
  )
  /** Cold start with no remembered source: land on Demo with the board visible. */
  const defaultSource: KeyboardSelectionSource | null =
    onlySource ||
    (storedIsChoice
      ? (selectedSource as KeyboardSelectionSource)
      : selectedSource
        ? null
        : (sourceChoices.find(source => source.id === 'demo')?.id ?? null))

  let source = $state<KeyboardSelectionSource | null>(defaultSource)
  let menuOpen = $state(false)
  let gh = $state<GithubChromeStatus | null>(null)
  let demoName = $state<string | null>(
    DEMO_CATALOG.find(entry => entry.id === readStoredDemoId())?.name ?? null
  )
  let clipboardKeyboard = $state<string | null>(null)

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
    if (source === 'clipboard') {
      return clipboardKeyboard ? `Clipboard · ${clipboardKeyboard}` : 'Clipboard'
    }
    if (source === 'demo') return demoName ? `Demo · ${demoName}` : 'Demo'
    if (source !== 'github') return 'Source'
    if (gate === 'login') return 'Login with GitHub'
    if (gate === 'install') return 'Add Repository'
    if (!gh?.ready || !gh.authorized || !gh.appInstalled) return 'GitHub'
    return githubChipLabel(gh.repoFullName, gh.repoFullNames, gh.branch)
  })

  const triggerTitle = $derived.by(() => {
    if (source === 'local') return 'Local files'
    if (source === 'clipboard') {
      return clipboardKeyboard
        ? `Clipboard keyboard: ${clipboardKeyboard}`
        : 'Paste a .keymap from the clipboard (layout optional)'
    }
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

  function stampSelection(event: KeymapPickerPayload): KeymapEvent | null {
    // Chip `source` wins over any stale `event.source` from a prior load.
    if (!source || !event.keymap) return null
    const { layout, keymap, warnings } = event

    if (source === 'demo') {
      const demo = 'demo' in event ? event.demo : undefined
      if (demo?.name) demoName = demo.name
      return {
        source: 'demo',
        layout,
        keymap,
        warnings,
        demo,
        demoHost: 'demoHost' in event ? event.demoHost : undefined
      }
    }

    if (source === 'clipboard') {
      const base =
        typeof keymap.keyboard === 'string' && keymap.keyboard
          ? keymap.keyboard
          : 'clipboard'
      const inferred =
        'clipboardInferredLayout' in event
          ? Boolean(event.clipboardInferredLayout)
          : false
      clipboardKeyboard = inferred ? `${base} (inferred)` : base
      return {
        source: 'clipboard',
        layout,
        keymap,
        warnings,
        clipboardOriginalSource:
          'clipboardOriginalSource' in event
            ? event.clipboardOriginalSource
            : undefined,
        clipboardInferredLayout: inferred || undefined
      }
    }

    if (source === 'github') {
      if (!('github' in event) || !event.github) return null
      return {
        source: 'github',
        github: event.github,
        layout,
        keymap,
        warnings,
        preserveSession:
          'preserveSession' in event ? event.preserveSession : undefined,
        hostSnapshot: 'hostSnapshot' in event ? event.hostSnapshot : undefined,
        hostSnapshotError:
          'hostSnapshotError' in event ? event.hostSnapshotError : undefined
      }
    }

    return { source: 'local', layout, keymap, warnings }
  }

  function handleKeyboardSelected(event: KeymapPickerPayload) {
    const selection = stampSelection(event)
    if (!selection) return
    // layer_names: normalizeParsedKeymap at editor accept (cloneParsedKeymap)
    if (event.userInitiated) menuOpen = false
    onSelect(selection)
  }

  function connectGithub() {
    source = 'github'
    menuOpen = true
  }

  function connectClipboard() {
    source = 'clipboard'
    menuOpen = true
  }

  $effect(() => {
    const src = source
    if (src) localStorage.setItem('selectedSource', src)
    if (src !== 'local') return

    let cancelled = false
    void (async () => {
      const [layout, keymap] = await Promise.all([loadLayout(), loadKeymap()])
      if (cancelled) return
      handleKeyboardSelected({
        layout,
        keymap: keymap as ParsedKeymap
      })
    })()

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    const next = openSource
    if (!next) return
    if (sourceChoices.some(choice => choice.id === next)) {
      source = next as KeyboardSelectionSource
      menuOpen = true
    }
    onOpenSourceConsumed?.()
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
      accent={source === 'demo'}
      popup={gate === null}
      bind:open={menuOpen}
      onActivate={runGate}
    >
      {#if sourceChoices.length > 1}
        <div
          class="source-cards"
          role="radiogroup"
          aria-label="Keymap source"
        >
          {#each sourceChoices as choice}
            <button
              type="button"
              class="source-card"
              class:selected={choice.id === source}
              role="radio"
              aria-checked={choice.id === source}
              data-source={choice.id}
              title={choice.blurb}
              onclick={() => {
                source = choice.id
              }}
            >
              <span class="source-card-name">{choice.name}</span>
              <span class="source-card-blurb">{choice.blurb}</span>
            </button>
          {/each}
        </div>
      {/if}
      {#if source === 'demo'}
        <DemoPicker
          onSelect={handleKeyboardSelected}
          onConnectClipboard={connectClipboard}
          onConnectGithub={config.enableGitHub ? connectGithub : undefined}
          showGithubCta={config.enableGitHub}
        />
      {/if}
      {#if source === 'clipboard'}
        <ClipboardPicker onSelect={handleKeyboardSelected} />
      {/if}
      {#if source === 'github'}
        <GithubPicker
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

  .source-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: 6px;
    width: 100%;
  }

  .source-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    margin: 0;
    padding: 8px 8px 7px;
    color: inherit;
    font: inherit;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  .source-card:hover {
    border-color: var(--text-muted);
  }

  .source-card.selected {
    border-color: var(--accent, #2a9d8f);
    box-shadow: inset 0 0 0 1px var(--accent, #2a9d8f);
  }

  .source-card-name {
    font-weight: 600;
    font-size: var(--font-md);
    line-height: 1.2;
  }

  .source-card-blurb {
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.25;
  }
</style>
