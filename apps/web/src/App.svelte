<script lang="ts">
  import { onMount } from 'svelte'
  import * as config from './lib/config'
  import { setDefinitionsContext } from './lib/context'
  import { editor, type KeyboardSelection } from './lib/editor.svelte.js'
  import { handleEditorShortcut } from './lib/editor-shortcuts'
  import { publishKeymap } from './lib/publish-keymap'
  import { reloadLocalKeyboard } from './lib/api'
  import KeyboardPicker from './lib/components/Pickers/KeyboardPicker.svelte'
  import Spinner from './lib/components/Common/Spinner.svelte'
  import Keyboard from './lib/components/Keyboard/Keyboard.svelte'
  import GitHubLink from './lib/components/GitHubLink.svelte'
  import HostLegendPicker from './lib/components/HostLegendPicker.svelte'
  import Loader from './lib/components/Common/Loader.svelte'
  import github from './lib/github/api.svelte.js'
  import { formatKeymapChange } from '@keymap-editor/keymap-core'

  // Proxy so context consumers stay reactive to editor.definitions ($state).
  setDefinitionsContext({
    get current() {
      return editor.definitions
    },
    set current(value) {
      editor.definitions = value
    }
  })

  let changesOpen = $state(false)

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) =>
      handleEditorShortcut(event, editor)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function initialize() {
    editor.initCatalogs()
  }

  async function handleWriteFiles() {
    const ok = await publishKeymap(editor, {
      write: async () => {
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
          throw Object.assign(new Error('Save failed'), {
            response: { data }
          })
        }
        return data
      },
      reload: reloadLocalKeyboard
    })
    if (ok) changesOpen = false
  }

  async function handleCommitToGitHub() {
    const gh = editor.githubMeta
    if (!gh || !editor.layout || !editor.draftKeymap) return
    const ok = await publishKeymap(editor, {
      write: async () => {
        const result = await github.commitChanges(
          gh.repository,
          gh.branch,
          editor.layout,
          editor.draftKeymap
        )
        return result.data
      },
      reload: () => github.fetchLayoutAndKeymap(gh.repository, gh.branch)
    })
    if (ok) changesOpen = false
  }
</script>

<Loader load={initialize}>
  <div class="app-chrome" id="actions">
    <div class="chrome-group chrome-source">
      <KeyboardPicker
        onSelect={event => {
          void editor.selectKeyboard(event as KeyboardSelection)
          changesOpen = false
        }}
      />
    </div>

    {#if editor.draftKeymap}
      <span class="chrome-sep" aria-hidden="true"></span>
      <div class="chrome-group actions-history">
        <button
          type="button"
          title="Undo (Ctrl/Cmd+Z)"
          disabled={!editor.canUndo}
          onclick={() => editor.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          title="Redo (Ctrl/Cmd+Shift+Z)"
          disabled={!editor.canRedo}
          onclick={() => editor.redo()}
        >
          Redo
        </button>
      </div>
    {/if}

    <span class="chrome-sep" aria-hidden="true"></span>
    <div id="legend-mode" class="chrome-group" role="radiogroup" aria-label="Legend mode">
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

    <div class="chrome-end">
      <span class="chrome-sep" aria-hidden="true"></span>
      <div class="chrome-group actions-publish">
        {#if editor.draftKeymap}
          <div class="change-status">
            {#if editor.isDirty}
              <button
                type="button"
                class="publish-status dirty change-toggle"
                aria-expanded={changesOpen}
                onclick={() => (changesOpen = !changesOpen)}
              >
                {editor.statusText}
                <span class="change-count">
                  {editor.changes.length}
                  {editor.changes.length === 1 ? 'change' : 'changes'}
                </span>
              </button>
              <button
                type="button"
                class="discard-draft"
                title="Revert all unpublished edits to the last loaded keymap"
                disabled={editor.saving}
                onclick={() => {
                  const ok = window.confirm(
                    'Discard all unpublished edits and restore the last loaded keymap?\n\nThis cannot be undone with Undo.'
                  )
                  if (!ok) return
                  changesOpen = false
                  void editor.discardDraft()
                }}
              >
                Discard draft
              </button>
              {#if changesOpen}
                <ul class="change-list" role="list">
                  {#each editor.changes as change}
                    <li>{formatKeymapChange(change)}</li>
                  {/each}
                </ul>
              {/if}
            {:else}
              <span class="publish-status">{editor.statusText}</span>
            {/if}
          </div>
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
      </div>
    </div>

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
  {#if editor.legendMode === 'composed'}
    <div class="host-legend-wrap">
      <HostLegendPicker />
    </div>
  {/if}
  {#if editor.definitions && editor.layout && editor.draftKeymap}
    <Keyboard
      layout={editor.layout}
      keymap={editor.draftKeymap}
      onUpdate={next => editor.updateKeymap(next)}
      legendMode={editor.legendMode}
      hostView={editor.hostLegend}
      legendHover={editor.legendHover}
    />
  {/if}
</Loader>
<GitHubLink />
<!-- Inside the Svelte mount so portaled dialogs still receive delegated clicks. -->
<div id="modal-root"></div>

<style>
  .app-chrome {
    position: relative;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    padding: 4px 12px 8px;
  }

  .chrome-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .chrome-sep {
    display: inline-block;
    align-self: center;
    width: 1px;
    height: 28px;
    background: #ccc;
    flex-shrink: 0;
  }

  .chrome-end {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }

  .host-legend-wrap {
    padding: 0 12px 8px;
  }

  #legend-mode {
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

  .change-status {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    max-width: min(420px, 70vw);
  }

  .publish-status {
    align-self: center;
    font-size: 90%;
    color: var(--muted, #555);
    margin-right: 0;
  }

  .publish-status.dirty {
    color: #664d03;
  }

  /* Override #actions button chrome for the expandable dirty status. */
  #actions button.publish-status.change-toggle {
    cursor: pointer;
    background: transparent;
    color: #664d03;
    border: none;
    border-radius: 5px;
    padding: 4px 8px;
    margin: 0;
    font: inherit;
    font-weight: 400;
    text-align: left;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: baseline;
    box-shadow: none;
  }

  #actions button.publish-status.change-toggle:hover {
    background: rgba(0, 0, 0, 0.06);
  }

  #actions button.discard-draft {
    cursor: pointer;
    background: transparent;
    color: #842029;
    border: 1px solid #e2b6bb;
    border-radius: 5px;
    padding: 4px 10px;
    margin: 0;
    font: inherit;
    font-size: 90%;
    font-weight: 500;
    box-shadow: none;
  }

  #actions button.discard-draft:hover:not(:disabled) {
    background: #f8d7da;
  }

  #actions button.discard-draft:disabled {
    background: transparent;
    color: #ccc;
    border-color: #ddd;
    cursor: not-allowed;
  }

  .change-count {
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .change-list {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 6;
    margin: 0;
    padding: 8px 10px;
    list-style: none;
    max-height: min(240px, 40vh);
    overflow: auto;
    min-width: 220px;
    max-width: min(420px, 90vw);
    background: #fffef8;
    color: #664d03;
    border: 1px solid #e6d9a8;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
    font-size: 85%;
    line-height: 1.35;
  }

  .change-list li + li {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid #efe6c4;
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
