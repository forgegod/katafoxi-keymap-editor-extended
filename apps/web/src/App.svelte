<script lang="ts">
  import * as config from './lib/config'
  import { setDefinitionsContext } from './lib/context'
  import { editor, type KeyboardSelection } from './lib/editor.svelte.js'
  import { reloadLocalKeyboard } from './lib/api'
  import KeyboardPicker from './lib/components/Pickers/KeyboardPicker.svelte'
  import Spinner from './lib/components/Common/Spinner.svelte'
  import Keyboard from './lib/components/Keyboard/Keyboard.svelte'
  import GitHubLink from './lib/components/GitHubLink.svelte'
  import Loader from './lib/components/Common/Loader.svelte'
  import github from './lib/github/api.svelte.js'
  import type { LayoutKey, ParsedKeymap } from '@keymap-editor/keymap-core'

  // Proxy so context consumers stay reactive to editor.definitions ($state).
  setDefinitionsContext({
    get current() {
      return editor.definitions
    },
    set current(value) {
      editor.definitions = value
    }
  })

  async function initialize() {
    editor.initCatalogs()
  }

  async function handleWriteFiles() {
    if (editor.saving || !editor.isDirty || !editor.draftKeymap) return
    editor.saving = true
    const token = editor.beginPublish()
    const sourceAtStart = editor.source
    const githubAtStart = editor.githubMeta
    try {
      const response = await fetch(`${config.apiBaseUrl}/keymap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editor.draftKeymap)
      })
      const contentType = response.headers.get('content-type') || ''
      const data = contentType.includes('application/json')
        ? await response.json()
        : null

      if (!response.ok) {
        editor.applySaveFailure(data)
        return
      }

      try {
        const reloaded = await reloadLocalKeyboard()
        if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
          return
        }
        if (reloaded.layout) {
          editor.layout = reloaded.layout as LayoutKey[]
        }
        editor.applyPublished(reloaded.keymap as ParsedKeymap, data)
      } catch {
        if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
          return
        }
        editor.applyReloadFailure(sourceAtStart)
      }
    } catch {
      editor.applySaveFailure(null)
    } finally {
      editor.saving = false
    }
  }

  async function handleCommitToGitHub() {
    const gh = editor.githubMeta
    if (!gh || !editor.layout || !editor.draftKeymap || !editor.isDirty) return
    editor.saving = true
    const token = editor.beginPublish()
    const sourceAtStart = editor.source
    const githubAtStart = editor.githubMeta
    try {
      const result = await github.commitChanges(
        gh.repository,
        gh.branch,
        editor.layout,
        editor.draftKeymap
      )

      try {
        const reloaded = await github.fetchLayoutAndKeymap(
          gh.repository,
          gh.branch
        )
        if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
          return
        }
        if (reloaded.layout) {
          editor.layout = reloaded.layout as LayoutKey[]
        }
        editor.applyPublished(reloaded.keymap as ParsedKeymap, result.data)
      } catch {
        if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
          return
        }
        editor.applyReloadFailure(sourceAtStart)
      }
    } catch (err) {
      const requestErr = err as { response?: { data?: unknown } }
      editor.applySaveFailure(requestErr.response?.data ?? null)
    } finally {
      editor.saving = false
    }
  }
</script>

<Loader load={initialize}>
  <KeyboardPicker
    onSelect={event => editor.selectKeyboard(event as KeyboardSelection)}
  />
  <div id="legend-mode" role="radiogroup" aria-label="Legend mode">
    <span class="legend-mode-label">Legend:</span>
    <label class:active={editor.legendMode === 'zmk'}>
      <input type="radio" bind:group={editor.legendMode} value="zmk" />
      ZMK code
    </label>
    <label class:active={editor.legendMode === 'composed'}>
      <input type="radio" bind:group={editor.legendMode} value="composed" />
      Host composed
    </label>
  </div>
  <div id="actions">
    {#if editor.draftKeymap}
      <span class="publish-status" class:dirty={editor.isDirty}>
        {editor.statusText}
      </span>
    {/if}
    {#if editor.source === 'local'}
      <button
        disabled={!editor.isDirty || editor.saving}
        onclick={handleWriteFiles}
      >
        {editor.saving ? 'Saving' : 'Write files'}
        {#if editor.saving}<Spinner />{/if}
      </button>
    {/if}
    {#if editor.source === 'github'}
      <button
        title="Commit keymap changes to GitHub repository"
        disabled={!editor.isDirty || editor.saving}
        onclick={handleCommitToGitHub}
      >
        {editor.saving ? 'Saving' : 'Commit to GitHub'}
        {#if editor.saving}<Spinner />{/if}
      </button>
    {/if}
    {#if editor.saveNotice}
      <div
        class="save-notice"
        class:warning={editor.saveNotice.kind === 'warning'}
        class:error={editor.saveNotice.kind === 'error'}
        role={editor.saveNotice.kind === 'error' ? 'alert' : 'status'}
      >
        {#each editor.saveNotice.messages as message}
          <p>{message}</p>
        {/each}
      </div>
    {/if}
  </div>
  {#if editor.definitions && editor.layout && editor.draftKeymap}
    <Keyboard
      layout={editor.layout}
      keymap={editor.draftKeymap}
      onUpdate={next => editor.updateKeymap(next)}
      legendMode={editor.legendMode}
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
    align-items: center;
    gap: 6px;
    font-size: 90%;
  }

  .legend-mode-label {
    color: var(--muted, #555);
    margin-right: 4px;
  }

  #legend-mode label {
    cursor: pointer;
    user-select: none;
    background-color: rgba(201, 201, 201, 0.85);
    color: darkgray;
    border-radius: 15px;
    height: 30px;
    line-height: 30px;
    padding: 0 12px;
    margin: 0;
  }

  #legend-mode label:hover {
    background-color: var(--hover-selection);
    color: white;
  }

  #legend-mode label.active {
    background-color: var(--selection);
    color: white;
  }

  #legend-mode input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .publish-status {
    align-self: center;
    font-size: 90%;
    color: var(--muted, #555);
    margin-right: 8px;
  }

  .publish-status.dirty {
    color: #664d03;
  }

  .save-notice {
    flex: 1 1 100%;
    margin: 0;
    padding: 8px 12px;
    font-size: 90%;
    line-height: 1.4;
    border-radius: 5px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
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
