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
  let topEl: HTMLDivElement | undefined = $state()
  /** Tools sit under the pipelines when they no longer fit beside them. */
  let toolsBelow = $state(false)

  $effect(() => {
    const root = topEl
    const toolsShown = editor.draftKeymap != null
    if (!root || !toolsShown) {
      toolsBelow = false
      return
    }
    const pipelines = root.querySelector<HTMLElement>('.chrome-pipelines')
    const tools = root.querySelector<HTMLElement>('.chrome-tools')
    if (!pipelines || !tools) return

    const measure = () => {
      const styles = getComputedStyle(root)
      const padX =
        (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
      const gap = parseFloat(styles.columnGap || styles.gap) || 16
      const available = root.clientWidth - padX
      const pipelinesW = pipelines.offsetWidth
      const legend = tools.querySelector<HTMLElement>('.host-legend-strip')
      const gaps = tools.querySelector<HTMLElement>('.host-gaps')
      const toolsW =
        (legend?.scrollWidth ?? tools.scrollWidth) +
        (gaps ? gaps.offsetWidth + 12 : 0)
      toolsBelow = pipelinesW + gap + toolsW > available + 1
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(pipelines)
    observer.observe(tools)
    const legend = tools.querySelector('.host-legend-strip')
    if (legend) observer.observe(legend)
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
    class="app-top"
    class:tools-below={toolsBelow}
    bind:this={topEl}
  >
    <!-- Pipeline chrome only: #actions button styles must not reach the legend tools. -->
    <div class="app-chrome" id="actions">
      <div class="chrome-pipelines">
        <div class="chrome-lane chrome-zmk" aria-label="ZMK keymap">
          <span class="lane-label" title="ZMK keymap: source, edit history, and publish">ZMK</span>

          {#if editor.draftKeymap}
            <div class="chrome-group chrome-draft">
              <ChromeStatus
                class="publish-status"
                dirty={editor.isDirty}
                label={editor.isDirty ? 'Changed' : 'Saved'}
                title={editor.statusText}
              />
              <button
                type="button"
                class="discard-draft"
                title={editor.isDirty
                  ? 'Revert all unpublished edits to the last loaded keymap'
                  : 'No unpublished edits to discard'}
                disabled={!editor.isDirty || editor.saving}
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
            </div>
          {/if}

          <div class="chrome-group chrome-source">
            <KeyboardPicker
              onSelect={event => {
                void editor.selectKeyboard(event as KeyboardSelection)
              }}
              onLogout={() => editor.clearLoadedKeymap()}
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
                {editor.saving ? 'Saving' : 'Commit'}
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

    {#if editor.draftKeymap}
      <div class="chrome-tools" aria-label="Legend tools">
        <div class="host-legend-wrap">
          <HostLegendPicker />
          <HostBasicGaps />
        </div>
      </div>
    {/if}
  </div>

  <div class="board-stack">
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
  /* Pipelines (white) + legend tools (stage) share one top band; not one chrome block. */
  .app-top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 6px 16px;
    background: var(--stage-bg);
  }

  .app-chrome {
    position: relative;
    z-index: 5;
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
    margin: 6px 0 0 8px;
    padding: 0;
    font-size: var(--font-md);
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .chrome-pipelines {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }

  /* Each pipeline is its own sausage; stage shows in the gap between. */
  .chrome-lane {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: flex-end;
    gap: 4px 6px;
    min-width: 0;
    box-sizing: border-box;
    padding: 4px 8px;
    background: var(--surface);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--shade) 6%, transparent);
  }

  /* Tight label column + fixed status slot so Draft/Changed dots share an edge. */
  .chrome-pipelines :global(.lane-label) {
    width: 2.6rem;
    margin-right: 0;
  }

  .chrome-pipelines :global(.chrome-status) {
    box-sizing: border-box;
    width: 5.5rem;
    min-width: 5.5rem;
    justify-content: flex-start;
  }

  .chrome-pipelines :global(.host-pipeline) {
    gap: 4px 6px;
  }

  /* Same panel as before: on stage, own controls, not under #actions. */
  .chrome-tools {
    position: relative;
    z-index: 4;
    flex: 1 1 auto;
    min-width: 0;
    margin: 6px 8px 0 0;
    padding: 0 4px 2px 12px;
    box-sizing: border-box;
  }

  .chrome-tools::before {
    content: '';
    position: absolute;
    left: 0;
    top: 2px;
    bottom: 2px;
    width: 1px;
    background: var(--border-soft);
  }

  .app-top.tools-below .chrome-tools {
    flex: 1 1 100%;
    margin: 0 8px 0;
    padding: 8px 4px 2px 2px;
  }

  .app-top.tools-below .chrome-tools::before {
    left: 2px;
    right: 2px;
    top: 0;
    bottom: auto;
    width: auto;
    height: 1px;
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
    grid-template-rows: minmax(0, 1fr);
    background: var(--stage-bg);
  }

  .board-stack :global(.keyboard-stage) {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    min-height: 0;
  }

  .host-legend-wrap {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px 12px;
    min-width: 0;
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
