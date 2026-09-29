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
  import HostLegendView from './lib/components/HostLegendView.svelte'
  import HostSymbolCatalog from './lib/components/HostSymbolCatalog.svelte'
  import HostPipeline from './lib/components/HostPipeline.svelte'
  import Loader from './lib/components/Common/Loader.svelte'
  import github from './lib/github/api.svelte.js'
  import FirmwareBuild from './lib/components/FirmwareBuild.svelte'

  // Proxy so context consumers stay reactive to editor.definitions ($state).
  setDefinitionsContext({
    get current() {
      return editor.definitions
    },
    set current(value) {
      editor.definitions = value
    }
  })

  let buildRefresh = $state(0)

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) =>
      handleEditorShortcut(event, editor)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function initialize() {
    editor.initCatalogs()
    await editor.restoreHostProfiles()
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
    if (ok) buildRefresh += 1
  }
</script>

<Loader load={initialize}>
  <div class="app-chrome" id="actions">
    <div class="chrome-lane chrome-zmk" aria-label="ZMK keymap">
      <span class="lane-label" title="ZMK keymap: source, edit history, and publish">ZMK</span>
      <div class="chrome-group chrome-source">
        <KeyboardPicker
          onSelect={event => {
            void editor.selectKeyboard(event as KeyboardSelection)
          }}
        />
      </div>

      {#if editor.draftKeymap}
        <div class="chrome-group actions-history">
          <button
            type="button"
            class="history"
            aria-label="Undo"
            title="Undo (Ctrl/Cmd+Z)"
            disabled={!editor.canUndo}
            onclick={() => editor.undo()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h11a5 5 0 0 1 0 10H12" />
            </svg>
          </button>
          <button
            type="button"
            class="history"
            aria-label="Redo"
            title="Redo (Ctrl/Cmd+Shift+Z)"
            disabled={!editor.canRedo}
            onclick={() => editor.redo()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9a5 5 0 0 0 0 10h3" />
            </svg>
          </button>
        </div>
      {/if}

      <div class="chrome-group actions-publish">
        {#if editor.draftKeymap}
          <div class="change-status">
            <span class="publish-status" class:dirty={editor.isDirty}>{editor.statusText}</span>
            {#if editor.isDirty}
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
                  void editor.discardDraft()
                }}
              >
                Discard draft
              </button>
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
          {#if editor.githubMeta}
            <FirmwareBuild
              repository={editor.githubMeta.repository}
              branch={editor.githubMeta.branch}
              refreshKey={buildRefresh}
            />
          {/if}
        {/if}
      </div>
    </div>

    <span class="chrome-sep" aria-hidden="true"></span>

    <div class="chrome-lane chrome-host" aria-label="Host layout">
      <HostPipeline />
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
  <div class="board-stack">
    {#if editor.draftKeymap}
      <div class="host-legend-wrap">
        <div class="legend-with-view">
          <HostLegendView />
          <HostLegendPicker />
        </div>
        <HostSymbolCatalog />
      </div>
    {/if}
    {#if editor.definitions && editor.layout && editor.draftKeymap}
      <Keyboard
        layout={editor.layout}
        keymap={editor.draftKeymap}
        onUpdate={next => editor.updateKeymap(next)}
        hostView={editor.hostLegend}
        layerView={editor.layerView}
        legendHover={editor.legendHover}
      />
    {/if}
  </div>
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
    align-items: flex-end;
    gap: 4px 12px;
    padding: 2px 10px 4px;
    font-size: 13px;
  }

  .chrome-lane {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: flex-end;
    gap: 6px 8px;
    min-width: 0;
  }

  .lane-label {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    height: 26px;
    margin: 0 2px 0 0;
    padding: 0;
    color: #555;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .chrome-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .chrome-source {
    align-items: flex-end;
  }

  .actions-history {
    gap: 4px;
  }

  #actions button.history {
    width: 26px;
    height: 26px;
    padding: 0;
    margin: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  #actions button.history svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  #actions button.history:disabled {
    color: #555;
  }

  .chrome-sep {
    display: inline-block;
    align-self: stretch;
    width: 1px;
    min-height: 22px;
    margin: 2px 0;
    background: #ccc;
    flex-shrink: 0;
  }

  .board-stack {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .board-stack :global(.keyboard-stage) {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    min-height: 0;
  }

  .host-legend-wrap {
    grid-column: 1;
    grid-row: 1;
    align-self: start;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 0 8px 4px 12px;
    min-width: max-content;
  }

  .legend-with-view {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }

  .change-status {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
  }

  .publish-status {
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    height: 26px;
    min-width: 11em;
    font-size: 13px;
    white-space: nowrap;
    color: var(--muted, #555);
    margin-right: 0;
  }

  .publish-status.dirty {
    color: #664d03;
  }

  #actions button.discard-draft {
    cursor: pointer;
    background: transparent;
    color: #842029;
    border: 1px solid #e2b6bb;
    border-radius: 5px;
    box-sizing: border-box;
    height: 26px;
    padding: 0 8px;
    margin: 0;
    font: inherit;
    font-size: 13px;
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
