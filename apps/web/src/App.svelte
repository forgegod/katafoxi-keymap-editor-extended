<script lang="ts">
  import { onMount } from 'svelte'
  import { parseDtsKeymap, parseKeymap } from '@keymap-editor/keymap-core'
  import * as config from './lib/config'
  import { setDefinitionsContext } from './lib/context'
  import { editor } from './lib/editor.svelte.js'
  import { handleEditorShortcut } from './lib/editor-shortcuts'
  import { hasEscapeOverlay } from './lib/escape-stack'
  import { publishKeymap } from './lib/publish-keymap'
  import { reloadLocalKeyboard } from './lib/api'
  import { buildClipboardExport } from './lib/clipboard/export'
  import { formatKeymapSaveWarnings } from './lib/keymap-save-warnings'
  import { writeClipboardOriginalSource } from './lib/clipboard/session'
  import KeyboardPicker from './lib/components/Pickers/KeyboardPicker.svelte'
  import ClipboardExportSheet from './lib/components/Pickers/Clipboard/ExportSheet.svelte'
  import Spinner from './lib/components/Common/Spinner.svelte'
  import Keyboard from './lib/components/Keyboard/Keyboard.svelte'
  import GitHubLink from './lib/components/GitHubLink.svelte'
  import ThemeToggle from './lib/components/ThemeToggle.svelte'
  import HostBasicGaps from './lib/components/HostBasicGaps.svelte'
  import HostLegendPicker from './lib/components/HostLegendPicker.svelte'
  import HostPipeline from './lib/components/HostPipeline.svelte'
  import CoachTour from './lib/components/CoachTour.svelte'
  import Loader from './lib/components/Common/Loader.svelte'
  import github from './lib/github/api.svelte.js'
  import FirmwareBuild from './lib/components/FirmwareBuild.svelte'
  import ChromeStatus from './lib/components/Common/ChromeStatus.svelte'
  import Button from './lib/components/Common/Button.svelte'

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
  let openSourceRequest = $state<string | null>(null)
  let tourExpandLegend = $state(false)
  let tourRestartKey = $state(0)
  let clipboardExport = $state<{
    code: string
    copied: boolean
    warnings: string[]
  } | null>(null)

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (hasEscapeOverlay()) return
      handleEditorShortcut(event, editor)
    }
    const flushDraft = () => {
      void editor.flushPendingPersist()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraft()
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flushDraft)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flushDraft)
    }
  })

  async function initialize() {
    editor.initCatalogs()
    await editor.restoreHostProfiles()
  }

  async function handleWriteFiles() {
    await publishKeymap(editor, {
      write: async sentDraft => {
        const response = await fetch(`${config.apiBaseUrl}/keymap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sentDraft)
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
      write: async sentDraft => {
        const result = await github.commitChanges(
          gh.repository,
          gh.branch,
          editor.layout,
          sentDraft,
          editor.buildCurrentHostKeymapSnapshot(),
          editor.buildCurrentHostKeymapDeliverables(),
          gh.headSha
        )
        return result.data
      },
      reload: () => github.fetchLayoutAndKeymap(gh.repository, gh.branch)
    })
    if (ok) buildRefresh += 1
  }

  async function handleCopyClipboard() {
    if (!editor.layout || !editor.draftKeymap || editor.saving) return
    editor.saving = true
    try {
      const built = buildClipboardExport(
        editor.layout,
        editor.draftKeymap,
        editor.clipboardOriginalSource
      )
      let copied = false
      try {
        await navigator.clipboard.writeText(built.code)
        copied = true
      } catch {
        copied = false
      }

      editor.clipboardOriginalSource = built.code
      const identity = editor.currentDraftIdentity()
      if (identity) writeClipboardOriginalSource(identity, built.code)

      const km = editor.draftKeymap
      const raw = parseDtsKeymap(built.code, {
        keyboard: typeof km.keyboard === 'string' ? km.keyboard : 'clipboard',
        keymap: typeof km.keymap === 'string' ? km.keymap : 'clipboard',
        layout: typeof km.layout === 'string' ? km.layout : 'LAYOUT'
      })
      const reloaded = parseKeymap(raw)
      if (editor.isDirty) {
        editor.applyClipboardCopied(reloaded, {
          mode: built.mode,
          warnings: built.warnings
        })
      } else {
        editor.saveNotice = null
      }

      clipboardExport = {
        code: built.code,
        copied,
        warnings: formatKeymapSaveWarnings(built.warnings)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not build the .keymap export'
      editor.saveNotice = { kind: 'error', messages: [message] }
    } finally {
      editor.saving = false
    }
  }
</script>

<Loader load={initialize}>
  <div
    class="app-top"
    class:tools-below={toolsBelow}
    bind:this={topEl}
  >
    <!-- Pipeline chrome: buttons use Common/Button (not #actions descendant styles). -->
    <div class="app-chrome" id="actions">
      <div class="chrome-pipelines">
        <div class="chrome-lane chrome-zmk" aria-label="What the firmware sends">
          <span
            class="lane-label"
            title="What the firmware sends — source, edit history, and publish"
          >ZMK</span>

          {#if editor.draftKeymap && (editor.isPublishDirty || editor.source !== 'demo')}
            <div class="chrome-group chrome-draft">
              <ChromeStatus
                class="publish-status{!editor.isDirty && editor.isHostRepoDirty
                  ? ' stacked'
                  : ''}"
                dirty={editor.isPublishDirty}
                label={editor.isPublishDirty
                  ? editor.isDirty
                    ? 'Changed'
                    : 'Host\nchanged'
                  : editor.source === 'clipboard'
                    ? 'Ready'
                    : 'Saved'}
                title={editor.statusText}
              />
              <Button
                variant="danger"
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
              </Button>
            </div>
          {/if}

          <div class="chrome-group chrome-source">
            <KeyboardPicker
              openSource={openSourceRequest}
              onOpenSourceConsumed={() => (openSourceRequest = null)}
              onSelect={event => {
                void editor.selectKeyboard(event)
              }}
              onLogout={() => editor.clearLoadedKeymap()}
            />
          </div>

          {#if editor.draftKeymap}
            <div class="chrome-group actions-history">
              <Button
                variant="icon"
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
              </Button>
              <Button
                variant="icon"
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
              </Button>
            </div>
          {/if}

          <div class="chrome-group actions-publish">
            {#if editor.source === 'demo'}
              <span
                class="demo-status"
                title="Demo edits stay in this browser. Connect GitHub or Local to save a real config."
              >
                Demo — not saved to a repo
              </span>
            {/if}
            {#if editor.source === 'clipboard' && editor.draftKeymap}
              <Button
                variant="publish"
                ready={editor.isDirty || !clipboardExport}
                title="Copy the current .keymap text so you can paste it into your firmware repo"
                disabled={editor.saving}
                onclick={() => void handleCopyClipboard()}
              >
                {editor.saving ? 'Copying' : 'Copy .keymap'}
                {#if editor.saving}<Spinner />{/if}
              </Button>
            {/if}
            {#if editor.source === 'local'}
              <Button
                variant="publish"
                ready={editor.isDirty}
                disabled={!editor.isDirty || editor.saving}
                onclick={handleWriteFiles}
              >
                {editor.saving ? 'Saving' : 'Write files'}
                {#if editor.saving}<Spinner />{/if}
              </Button>
            {/if}
            {#if editor.source === 'github'}
              <Button
                variant="publish"
                ready={editor.isPublishDirty}
                title="Commit keymap and host layout snapshot to the GitHub repository"
                disabled={!editor.isPublishDirty || editor.saving}
                onclick={handleCommitToGitHub}
              >
                {editor.saving ? 'Saving' : 'Commit'}
                {#if editor.saving}<Spinner />{/if}
              </Button>
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
          <div class="chrome-lane chrome-host" aria-label="What the OS types">
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
          {#each editor.saveNotice.links ?? [] as link}
            <p>
              <a href={link.href} target="_blank" rel="noopener noreferrer"
                >{link.label}</a
              >
            </p>
          {/each}
        </div>
      {/if}
    </div>

    {#if editor.draftKeymap}
      <div class="chrome-tools" aria-label="Legend tools">
        <div class="host-legend-wrap">
          <HostLegendPicker forceOpen={tourExpandLegend} />
          <HostBasicGaps />
        </div>
      </div>
    {/if}

    <div class="chrome-corner">
      {#if editor.source === 'demo' && editor.draftKeymap}
        <Button
          variant="outline"
          class="tour-reopen"
          title="Replay the short intro tour"
          aria-label="Replay the short intro tour"
          onclick={() => (tourRestartKey += 1)}
        >
          Tour
        </Button>
      {/if}
      <ThemeToggle />
      <GitHubLink />
    </div>
  </div>

  {#if editor.source === 'demo' && editor.draftKeymap}
    <CoachTour
      showGithub={config.enableGitHub}
      restartKey={tourRestartKey}
      bind:expandLegend={tourExpandLegend}
      onPasteKeymap={() => (openSourceRequest = 'clipboard')}
      onConnectGithub={
        config.enableGitHub ? () => (openSourceRequest = 'github') : undefined
      }
    />
  {/if}

  <div class="board-stack">
    {#if editor.definitions && editor.layout && editor.draftKeymap}
      <Keyboard
        layout={editor.layout}
        keymap={editor.draftKeymap}
        onUpdate={next => editor.updateKeymap(next)}
        hostView={editor.hostLegend}
        layerView={editor.layerView}
        legendHover={editor.legendHover}
        schemeMode={editor.schemeMode}
      />
    {/if}
  </div>
</Loader>

{#if clipboardExport}
  <ClipboardExportSheet
    code={clipboardExport.code}
    copied={clipboardExport.copied}
    warnings={clipboardExport.warnings}
    onClose={() => (clipboardExport = null)}
  />
{/if}
<!-- Inside the Svelte mount so portaled dialogs still receive delegated clicks. -->
<div id="modal-root"></div>

<style>
  /* Pipelines (white) + legend tools (stage) share one top band; not one chrome block. */
  .app-top {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 6px 16px;
    background: var(--stage-bg);
  }

  .chrome-corner {
    position: absolute;
    z-index: 6;
    top: 6px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .chrome-corner :global(.tour-reopen) {
    height: var(--chrome-h);
    padding: 0 8px;
    font-size: var(--font-sm, 0.85rem);
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

  /* Two-line host-repo dirty label inside the fixed status slot. */
  .chrome-pipelines :global(.chrome-status.stacked) {
    white-space: pre-line;
    line-height: 1.1;
    font-size: var(--font-xs);
    align-items: center;
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
    /* Keep the trailing edge clear of the absolute theme + repo controls. */
    padding: 0 calc(2 * var(--chrome-h) + 20px) 2px 12px;
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

  .demo-status {
    display: inline-flex;
    align-items: center;
    height: var(--chrome-h);
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
    white-space: nowrap;
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

  .board-stack :global(.keyboard-root),
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

  .save-notice a {
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
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
