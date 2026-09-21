<script lang="ts">
  import * as config from './lib/config'
  import type { Definitions, LegendMode } from './lib/context'
  import { definitionsStore } from './lib/stores'
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
  let saveNotice = $state<{
    kind: 'warning' | 'error'
    messages: string[]
  } | null>(null)

  $effect(() => {
    definitionsStore.set(definitions)
  })

  const WARNING_MESSAGES: Record<string, string> = {
    macros_expanded:
      'Macros were expanded to raw keycodes (for example VU → C_VOL_UP). #define lines in the keymap may now be unused.',
    generated_default_template:
      'No existing keymap or template was used, so the file was saved from the default generated template.'
  }

  function formatWarnings(warnings: unknown): string[] {
    if (!Array.isArray(warnings) || warnings.length === 0) return []
    return warnings.map(code => {
      const key = String(code)
      return WARNING_MESSAGES[key] ?? key
    })
  }

  function extractErrorMessages(data: unknown): string[] {
    if (
      data &&
      typeof data === 'object' &&
      Array.isArray((data as { errors?: unknown }).errors)
    ) {
      return (data as { errors: unknown[] }).errors.map(String)
    }
    return ['Save failed.']
  }

  function applySaveSuccess(data: unknown) {
    const warnings =
      data && typeof data === 'object'
        ? formatWarnings((data as { warnings?: unknown }).warnings)
        : []
    saveNotice = warnings.length > 0 ? { kind: 'warning', messages: warnings } : null
  }

  function applySaveFailure(data: unknown) {
    saveNotice = { kind: 'error', messages: extractErrorMessages(data) }
  }

  async function handleCompile() {
    if (saving) return
    saving = true
    try {
      const response = await fetch(`${config.apiBaseUrl}/keymap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingKeymap || keymap)
      })
      const contentType = response.headers.get('content-type') || ''
      const data = contentType.includes('application/json')
        ? await response.json()
        : null

      if (!response.ok) {
        applySaveFailure(data)
        return
      }
      applySaveSuccess(data)
    } catch {
      applySaveFailure(null)
    } finally {
      saving = false
    }
  }

  async function handleCommitChanges() {
    const gh = sourceOther?.github as { repository: string; branch: string }
    if (!gh || !layout || !editingKeymap) return
    saving = true
    try {
      const result = await github.commitChanges(
        gh.repository,
        gh.branch,
        layout,
        editingKeymap
      )
      applySaveSuccess(result.data)
      keymap = editingKeymap
      editingKeymap = null
    } catch (err) {
      const requestErr = err as { response?: { data?: unknown } }
      applySaveFailure(requestErr.response?.data ?? null)
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
    const [keycodesRes, behavioursRes] = await Promise.all([
      fetch('/keycodes'),
      fetch('/behaviors')
    ])
    if (!keycodesRes.ok || !behavioursRes.ok) {
      throw new Error(
        `API returned ${keycodesRes.status}/${behavioursRes.status}. Start with pnpm dev (API on :8080).`
      )
    }
    const [rawKeycodes, behaviours] = await Promise.all([
      keycodesRes.json(),
      behavioursRes.json()
    ])
    const { normalizeZmkKeycodes } = await import('./lib/keycodes')
    const keycodes = normalizeZmkKeycodes(rawKeycodes)
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
      <button disabled={!editingKeymap || saving} onclick={handleCompile}>
        {saving ? 'Saving' : 'Save Local'}
        {#if saving}<Spinner />{/if}
      </button>
    {/if}
    {#if source === 'github'}
      <button
        title="Commit keymap changes to GitHub repository"
        disabled={!editingKeymap || saving}
        onclick={handleCommitChanges}
      >
        {saving ? 'Saving' : 'Commit Changes'}
        {#if saving}<Spinner />{/if}
      </button>
    {/if}
    {#if saveNotice}
      <div
        class="save-notice"
        class:warning={saveNotice.kind === 'warning'}
        class:error={saveNotice.kind === 'error'}
        role={saveNotice.kind === 'error' ? 'alert' : 'status'}
      >
        {#each saveNotice.messages as message}
          <p>{message}</p>
        {/each}
      </div>
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

  #actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
  }

  .save-notice {
    flex: 1 1 100%;
    margin: 0;
    padding: 8px 12px;
    font-size: 90%;
    line-height: 1.4;
  }

  .save-notice p {
    margin: 0;
  }

  .save-notice p + p {
    margin-top: 4px;
  }

  .save-notice.warning {
    background: #fff3cd;
    color: #664d03;
  }

  .save-notice.error {
    background: #f8d7da;
    color: #842029;
  }
</style>
