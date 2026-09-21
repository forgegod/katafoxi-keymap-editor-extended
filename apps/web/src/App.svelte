<script lang="ts">
  import * as config from './lib/config'
  import type { Definitions, LegendMode } from './lib/context'
  import { definitionsStore } from './lib/stores'
  import { loadKeycodes } from './lib/keycodes'
  import { loadBehaviours } from './lib/api'
  import KeyboardPicker from './lib/components/Pickers/KeyboardPicker.svelte'
  import Spinner from './lib/components/Common/Spinner.svelte'
  import Keyboard from './lib/components/Keyboard/Keyboard.svelte'
  import GitHubLink from './lib/components/GitHubLink.svelte'
  import Loader from './lib/components/Common/Loader.svelte'
  import github from './lib/github/api'

  let definitions = $state<Definitions | null>(null)
  let source = $state<string | null>(null)
  let sourceOther = $state<Record<string, unknown> | null>(null)
  let layout = $state<unknown[] | null>(null)
  let keymap = $state<{
    layer_names?: string[]
    layers: Array<Array<{ value: string | number; params?: unknown[] }>>
  } | null>(null)
  let editingKeymap = $state<typeof keymap>(null)
  let saving = $state(false)
  let legendMode = $state<LegendMode>('zmk')

  $effect(() => {
    definitionsStore.set(definitions)
  })

  function handleCompile() {
    fetch(`${config.apiBaseUrl}/keymap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingKeymap || keymap)
    })
  }

  async function handleCommitChanges() {
    const gh = sourceOther?.github as { repository: string; branch: string }
    if (!gh || !layout || !editingKeymap) return
    saving = true
    try {
      await github.commitChanges(gh.repository, gh.branch, layout, editingKeymap)
      keymap = editingKeymap
      editingKeymap = null
    } finally {
      saving = false
    }
  }

  function handleKeyboardSelected(event: Record<string, unknown>) {
    source = (event.source as string) || null
    const { source: _s, layout: nextLayout, keymap: nextKeymap, ...other } =
      event
    sourceOther = other
    layout = (nextLayout as unknown[]) || null
    const km = nextKeymap as typeof keymap
    if (km && !km.layer_names) {
      km.layer_names = km.layers.map((_, i) => `Layer ${i}`)
    }
    keymap = km || null
    editingKeymap = null
  }

  async function initialize() {
    const [keycodes, behaviours] = await Promise.all([
      loadKeycodes(),
      loadBehaviours()
    ])
    const kc = keycodes as Definitions['keycodes']
    const bh = behaviours as Definitions['behaviours']
    kc.indexed = Object.fromEntries(kc.map(k => [k.code, k]))
    bh.indexed = Object.fromEntries(bh.map(b => [b.code, b]))
    definitions = { keycodes: kc, behaviours: bh }
  }

  function handleUpdateKeymap(next: NonNullable<typeof keymap>) {
    editingKeymap = next
  }
</script>

<Loader load={initialize}>
  <KeyboardPicker onSelect={handleKeyboardSelected} />
  <div id="legend-mode">
    <label>
      <input type="radio" bind:group={legendMode} value="zmk" />
      ZMK code
    </label>
    <label>
      <input type="radio" bind:group={legendMode} value="composed" />
      Host composed preview
    </label>
  </div>
  <div id="actions">
    {#if source === 'local'}
      <button disabled={!editingKeymap} onclick={handleCompile}>Save Local</button>
    {/if}
    {#if source === 'github'}
      <button
        title="Commit keymap changes to GitHub repository"
        disabled={!editingKeymap}
        onclick={handleCommitChanges}
      >
        {saving ? 'Saving' : 'Commit Changes'}
        {#if saving}<Spinner />{/if}
      </button>
    {/if}
  </div>
  {#if definitions && layout && keymap}
    <Keyboard
      layout={layout as never}
      keymap={editingKeymap || keymap}
      onUpdate={handleUpdateKeymap}
      {legendMode}
    />
  {/if}
</Loader>
<GitHubLink />

<style>
  #legend-mode {
    position: absolute;
    top: 8px;
    right: 20px;
    z-index: 5;
    display: flex;
    gap: 12px;
    font-size: 90%;
  }
</style>
