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
  import HostBasicGaps from './lib/components/HostBasicGaps.svelte'
  import HostLegendPicker from './lib/components/HostLegendPicker.svelte'
  import HostPipeline from './lib/components/HostPipeline.svelte'
  import Loader from './lib/components/Common/Loader.svelte'
  import github from './lib/github/api.svelte.js'
  import FirmwareBuild from './lib/components/FirmwareBuild.svelte'
  import ChromeStatus from './lib/components/Common/ChromeStatus.svelte'

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
  let chromeEl: HTMLDivElement | undefined = $state()
  /** Host sits on the next row when the two lanes no longer fit side by side. */
  let lanesStacked = $state(false)

  $effect(() => {
    const root = chromeEl
    const hostShown = editor.draftKeymap != null
    if (!root || !hostShown) {
      lanesStacked = false
      return
    }
    const zmk = root.querySelector<HTMLElement>('.chrome-zmk')
    const host = root.querySelector<HTMLElement>('.chrome-host')
    if (!zmk || !host) return

    const measure = () => {
      const zmkBottom = zmk.offsetTop + zmk.offsetHeight
      lanesStacked = host.offsetTop >= zmkBottom - 4
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(zmk)
    observer.observe(host)
    return () => observer.disconnect()
  })

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
  <div
    class="app-chrome"
    class:lanes-stacked={lanesStacked}
    id="actions"
    bind:this={chromeEl}
  >
    <div class="chrome-lane chrome-zmk" aria-label="ZMK keymap">
      <span class="lane-label" title="ZMK keymap: source, edit history, and publish">ZMK</span>
      <div class="chrome-group chrome-source">
        <KeyboardPicker
          onSelect={event => {
            void editor.selectKeyboard(event as KeyboardSelection)
          }}
          onLogout={() => editor.clearLoadedKeymap()}
        />
      </div>

      {#if editor.draftKeymap}
        <div class="chrome-group chrome-draft">
          <ChromeStatus
            class="publish-status"
            dirty={editor.isDirty}
            label="Draft"
            title={editor.statusText}
          />
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
        {#if editor.source === 'local'}
          <button
            class="primary"
            class:ready={editor.isDirty}
            disabled={!editor.isDirty || editor.saving}
            onclick={handleWriteFiles}
          >
            {editor.saving ? 'Saving' : 'Write files'}
            {#if editor.saving}<Spinner />{/if}
          </button>
        {/if}
        {#if editor.source === 'github'}
          <button
            class="primary"
            class:ready={editor.isDirty}
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

    {#if editor.draftKeymap}
      <div class="chrome-lane chrome-host" aria-label="Host layout">
        <HostPipeline />
      </div>
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
  <div class="board-stack">
    {#if editor.draftKeymap}
      <div class="host-legend-wrap">
        <HostLegendPicker />
        <HostBasicGaps />
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
        revealEmptyRow={editor.revealEmptyRow}
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
    gap: 12px 20px;
    padding: 6px 12px 8px;
    font-size: var(--font-md);
    background: var(--surface);
    border-bottom: 1px solid var(--border-soft);
    container-type: inline-size;
  }

  /* The rule follows the boundary: a short vertical stroke on one row, a horizontal stroke when Host wraps. */
  .chrome-host {
    position: relative;
  }

  .chrome-host::before {
    content: '';
    position: absolute;
    background: var(--border-soft);
    width: 1px;
    height: var(--chrome-h);
    left: -10px;
    bottom: 0;
  }

  .app-chrome.lanes-stacked .chrome-host::before {
    width: 100cqi;
    height: 1px;
    left: 0;
    bottom: auto;
    top: -6px;
  }

  .chrome-lane {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: flex-end;
    gap: 6px 8px;
    min-width: 0;
  }

  /* Grows so the spare width sits after Commit/Latest, before the Host divider. */
  .chrome-zmk {
    flex: 1 1 auto;
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
    width: var(--chrome-h);
    height: var(--chrome-h);
    padding: 0;
    margin: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    color: var(--text);
    border-color: var(--border);
  }

  #actions button.history:hover:not(:disabled) {
    background: var(--surface-sunken);
    color: var(--accent);
    border-color: var(--accent);
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
    background: var(--surface-sunken);
    color: var(--text-ghost);
    border-color: var(--border-subtle);
  }

  #actions button.primary.ready {
    background: var(--selection);
    color: var(--on-accent);
    border-color: transparent;
  }

  #actions button.primary.ready:hover:not(:disabled) {
    background: var(--ok-fill-strong);
    color: var(--on-accent);
  }

  #actions button.primary.ready:disabled {
    background: var(--hover-selection);
    color: var(--on-accent);
    border-color: transparent;
    opacity: 0.7;
  }

  .board-stack {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--stage-bg);
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
    gap: 8px 12px;
    margin: 6px 8px 0;
    padding: 0 4px 2px 2px;
    min-width: max-content;
    box-sizing: border-box;
  }

  #actions button.discard-draft {
    cursor: pointer;
    background: transparent;
    color: var(--danger-ink);
    border: 1px solid var(--danger-border);
    border-radius: 5px;
    box-sizing: border-box;
    height: var(--chrome-h);
    padding: 0 8px;
    margin: 0;
    font: inherit;
    font-size: var(--font-md);
    font-weight: 500;
    box-shadow: none;
  }

  #actions button.discard-draft:hover:not(:disabled) {
    background: var(--danger-wash);
  }

  #actions button.discard-draft:disabled {
    background: transparent;
    color: var(--text-ghost);
    border-color: var(--border-soft);
    cursor: not-allowed;
  }

  .save-notice {
    flex: 1 1 100%;
    margin: 0;
    padding: 8px 12px;
    font-size: var(--font-sm);
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
    background: var(--warn-wash);
    color: var(--warn-ink);
  }

  .save-notice.error {
    background: var(--danger-wash);
    color: var(--danger-ink);
  }
</style>
