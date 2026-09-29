<script lang="ts">
  import { editor } from '../editor.svelte.js'
  import { formatAltGrCopyLine, hostLanguage } from '@keymap-editor/keymap-core'
  import logoLinux from '../assets/logo-linux.png'
  import logoWindows from '../assets/logo-windows.png'
  import stackLanguagesIcon from '../assets/stack-languages.png'
  import symbolDifferencesIcon from '../assets/symbol-differences.png'
  import Modal from './Common/Modal.svelte'
  import LangFlag from './LangFlag.svelte'

  type InstallSheet = 'linux' | 'windows' | null

  let sheet = $state<InstallSheet>(null)
  let copyNote = $state('')

  const MSKLC_URL =
    'https://www.microsoft.com/en-us/download/details.aspx?id=102134'

  function safeFileName(name: string, ext: string): string {
    const safe = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'host-layout'
    return `${safe}.${ext}`
  }

  function downloadText(text: string, fileName: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function copyText(text: string, okMessage: string) {
    try {
      await navigator.clipboard.writeText(text)
      copyNote = okMessage
    } catch {
      copyNote = 'Could not copy — select the text manually'
    }
  }

  const dirty = $derived(editor.isHostDirty)
  const status = $derived(dirty ? 'Changed' : 'Clean')
  const exports = $derived.by(() => {
    void editor.hostLayoutRevision
    void editor.hostLegend
    return editor.listActiveHostLayoutExports()
  })
  const capsExports = $derived.by(() => {
    void editor.hostLayoutRevision
    void editor.hostLegend
    return editor.listCapsAlphabetKlcExports()
  })
  const canAlign = $derived(editor.canAlignHostSymbols)
  const canStackLanguages = $derived(editor.hostLegend.columns.length >= 3)
  const languagesStacked = $derived(editor.multilangViewOn)

  $effect(() => {
    if (editor.hostLegend.columns.length < 3 && editor.multilangView) {
      editor.multilangView = false
    }
  })
  const alignExtraName = $derived.by(() => {
    const open = editor.hostLegend.open
    return open ? hostLanguage(open).name : 'the other language'
  })
  const alignBaseName = $derived.by(() => {
    const language = editor.hostLegend.columns[0]?.language
    return language ? hostLanguage(language).name : 'English'
  })
  const altGrReplacements = $derived(
    (editor.altGrCopyPlan ?? []).filter(edit => edit.overwrites)
  )
  const altGrFills = $derived((editor.altGrCopyPlan ?? []).filter(edit => !edit.overwrites))

  /** Prefer small / easy-to-pick XKB modules over the huge defaults (us, winkeys, …). */
  function installTarget(item: (typeof exports)[number]) {
    if (item.language === 'en') {
      return {
        module: 'au',
        systemPath: '/usr/share/X11/xkb/symbols/au',
        userPath: '~/.xkb/symbols/au',
        variant: 'Australia (au)',
        tip: 'Prefer symbols/au (Australia), not us: the file is short and near the top of the symbols list, there is less layout-picker clutter across distros, and the Australian flag makes it obvious you are on your custom layout.',
        tipRu: null as string | null
      }
    }
    if (item.language === 'ru') {
      return {
        module: 'ru',
        systemPath: '/usr/share/X11/xkb/symbols/ru',
        userPath: '~/.xkb/symbols/ru',
        variant: 'legacy',
        tip: 'Prefer the legacy section at the top of symbols/ru — it is nearly empty and easy to select in the layout list.',
        tipRu:
          'Для русского удобнее секция legacy в начале файла symbols/ru: она почти пустая и её проще выбрать в списке раскладок.'
      }
    }
    return {
      module: item.xkbModule,
      systemPath: item.exampleSystemPath,
      userPath: item.exampleUserPath,
      variant: null as string | null,
      tip: null as string | null,
      tipRu: null as string | null
    }
  }

  function openSheet(next: 'linux' | 'windows') {
    if (!dirty) return
    copyNote = ''
    sheet = next
  }

  function closeSheet() {
    sheet = null
    copyNote = ''
  }

  function downloadSection(text: string, name: string) {
    downloadText(text, safeFileName(name, 'symbols.txt'))
  }

  function downloadBytes(bytes: Uint8Array, fileName: string) {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function downloadKlc(layoutId: string, name: string) {
    const file = editor.exportUserHostLayoutKlc(layoutId)
    if (!file) return
    downloadBytes(file.bytes, safeFileName(name, 'klc'))
  }

  function downloadCapsKlc(item: (typeof capsExports)[number]) {
    const file = editor.exportCapsAlphabetKlc(item.capsLanguage)
    if (!file) return
    downloadBytes(file.bytes, safeFileName(item.fileStem, 'klc'))
  }

  function downloadAllLinux() {
    const all = editor.exportActiveHostLayoutsXkb()
    if (!all) return
    downloadText(all.text, safeFileName(all.name, 'symbols.txt'))
  }
</script>

<div
  class="host-pipeline"
  class:dirty
  data-host-dirty={dirty ? 'true' : 'false'}
  title="Host layout: install results on the OS"
>
  <span class="label">Host</span>
  <span class="status" aria-live="polite">{status}</span>

  {#if canStackLanguages}
    <button
      type="button"
      class="tool icon toggle"
      class:on={languagesStacked}
      aria-pressed={languagesStacked}
      aria-label="Stack languages"
      title="Show every host language as its own row on the key and hide other firmware layers."
      onclick={() => (editor.multilangView = !editor.multilangView)}
    >
      <img src={stackLanguagesIcon} alt="" width="22" height="22" />
    </button>
  {/if}
  <button
    type="button"
    class="tool icon toggle"
    class:on={canAlign && editor.symbolAlignOn}
    aria-pressed={canAlign && editor.symbolAlignOn}
    aria-label="Highlight symbol differences"
    title="Underline punctuation that sits on a different key. Outline AltGr that Windows keeps from the other language only."
    disabled={!canAlign}
    onclick={() => (editor.symbolAlignOn = !editor.symbolAlignOn)}
  >
    <img src={symbolDifferencesIcon} alt="" width="22" height="22" />
  </button>
  {#if canAlign && editor.symbolAlignOn}
    <span class="align-legend">
      <span class="moved">position</span>
      <span class="win">Win AltGr</span>
    </span>
  {/if}
  <button
    type="button"
    class="tool"
    aria-label="Copy AltGr from the other language onto English"
    title="Copy AltGr and AltGr+Shift from {alignExtraName} onto {alignBaseName}. Empty cells stay as they are."
    disabled={!canAlign || editor.altGrCopyBusy}
    onclick={() => editor.beginAltGrCopy()}
  >
    Copy AltGr
  </button>

  <button
    type="button"
    class="download"
    aria-label="Install host layout on Linux"
    title="Open Linux install guide"
    disabled={!dirty}
    onclick={() => openSheet('linux')}
  >
    <img class="os-icon" src={logoLinux} alt="" width="16" height="16" />
    <span class="dl-label">Linux</span>
  </button>

  <button
    type="button"
    class="download"
    aria-label="Install host layout on Windows"
    title="Open Windows install guide"
    disabled={!dirty}
    onclick={() => openSheet('windows')}
  >
    <img class="os-icon" src={logoWindows} alt="" width="16" height="16" />
    <span class="dl-label">Windows</span>
  </button>
</div>

{#if sheet === 'linux'}
  <Modal onBackdrop={closeSheet}>
    <div class="install-dialog" role="dialog" aria-modal="true" aria-labelledby="linux-install-title">
      <header class="dialog-head">
        <img class="dialog-logo" src={logoLinux} alt="" width="28" height="28" />
        <div>
          <h2 id="linux-install-title">Install on Linux</h2>
          <p class="lede">
            This editor exports an <code>xkb_symbols</code> section to paste into an existing symbols
            file (or keep as a file). It is not a drop-in <code>.xkb</code> layout package.
          </p>
        </div>
      </header>

      <ol class="steps">
        <li>
          Only languages you changed appear below. Copy or download each section, then paste it into
          the recommended symbols file for that language.
        </li>
        <li>
          For English, prefer <code>symbols/au</code> (Australia) over <code>us</code>: the file is
          small, sits near the top of the list, avoids a huge US layout menu, and the AU flag shows
          you are on your custom layout.
        </li>
        <li>
          Saving under <code>/usr/share/X11/xkb/symbols/</code> usually needs
          <code>sudo</code>. A user copy under <code>~/.xkb/symbols/</code> may avoid that, but still
          needs to be wired into your XKB rules.
        </li>
        <li>
          Enable the variant in desktop keyboard settings, then re-login if it does not appear.
        </li>
      </ol>

      {#each exports as item (item.layoutId)}
        {@const target = installTarget(item)}
        <section class="layout-card">
          <h3>
            <span class="flag" aria-hidden="true"><LangFlag language={item.language} /></span>
            {item.languageName}
            <span class="profile-name">“{item.name}”</span>
            <span class="module">symbols/{target.module}{target.variant ? ` · ${target.variant}` : ''}</span>
          </h3>

          {#if target.tip}
            <p class="card-tip">{target.tip}</p>
          {/if}
          {#if target.tipRu}
            <p class="card-tip tip-ru" lang="ru">{target.tipRu}</p>
          {/if}

          <label class="path-label" for={`sys-path-${item.layoutId}`}>Example system path</label>
          <div class="path-row">
            <input
              id={`sys-path-${item.layoutId}`}
              class="path-input"
              readonly
              value={target.systemPath}
            />
            <button
              type="button"
              class="secondary"
              onclick={() => copyText(target.systemPath, 'System path copied')}
            >
              Copy path
            </button>
          </div>

          <label class="path-label" for={`user-path-${item.layoutId}`}>Example user path</label>
          <div class="path-row">
            <input
              id={`user-path-${item.layoutId}`}
              class="path-input"
              readonly
              value={target.userPath}
            />
            <button
              type="button"
              class="secondary"
              onclick={() => copyText(target.userPath, 'User path copied')}
            >
              Copy path
            </button>
          </div>

          <pre class="section-preview">{item.text}</pre>
          <div class="row-actions">
            <button
              type="button"
              class="primary"
              onclick={() => copyText(item.text, `Section “${item.name}” copied`)}
            >
              Copy section
            </button>
            <button
              type="button"
              class="secondary"
              onclick={() => downloadSection(item.text, item.name)}
            >
              Download file
            </button>
          </div>
        </section>
      {/each}

      {#if exports.length > 1}
        <div class="row-actions bulk">
          <button type="button" class="secondary" onclick={downloadAllLinux}>
            Download all sections
          </button>
        </div>
      {/if}

      {#if copyNote}
        <p class="copy-note" role="status">{copyNote}</p>
      {/if}

      <div class="dialog-foot">
        <button type="button" class="secondary" onclick={closeSheet}>Close</button>
      </div>
    </div>
  </Modal>
{/if}

{#if sheet === 'windows'}
  <Modal onBackdrop={closeSheet}>
    <div
      class="install-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="windows-install-title"
    >
      <header class="dialog-head">
        <img class="dialog-logo" src={logoWindows} alt="" width="28" height="28" />
        <div>
          <h2 id="windows-install-title">Install on Windows</h2>
          <p class="lede">
            Open the <code>.klc</code> file in Microsoft Keyboard Layout Creator, build the installer,
            then sign out so Windows loads the layout.
          </p>
        </div>
      </header>

      <ol class="steps">
        <li>
          Install
          <a href={MSKLC_URL} target="_blank" rel="noopener noreferrer">MSKLC from Microsoft</a>
          if you do not have it.
        </li>
        <li>Download a <code>.klc</code> file below.</li>
        <li>In MSKLC, use File → Load Source File, then Project → Build DLL and Setup Package.</li>
        <li>Run the installer, then sign out or reboot so Windows loads the new layout.</li>
      </ol>

      {#if capsExports.length > 0}
        <section class="paired" aria-labelledby="windows-paired-title">
          <h3 id="windows-paired-title">Two alphabets in one layout</h3>
          <p>
            This file stays an English keyboard in Windows. Caps Lock types the other language, so
            one English entry in the language list covers both alphabets.
          </p>
          <p>
            Some programs follow the active Windows language when they handle shortcuts. GIMP is a
            common case: shortcuts work on an English layout and fail while a Russian layout is
            selected. Here the active language stays English the whole time, and the second alphabet
            is only Caps Lock, so those shortcuts keep working.
          </p>
          <p>On each key:</p>
          <ul>
            <li>the key types the English letter</li>
            <li>Shift types the English capital</li>
            <li>Caps Lock types the other language</li>
            <li>Caps Lock together with Shift types that capital</li>
            <li>
              AltGr and AltGr+Shift type the other language’s extra symbols, with Caps Lock on or
              off
            </li>
          </ul>
          <p>Shift is how you get capitals. Caps Lock switches alphabet.</p>
          <p>
            AltGr and AltGr+Shift come from the other language. A plain US layout leaves those keys
            empty, so the national layout is where those characters live — German @, €, and brackets
            are typical. This file writes that national AltGr. When both columns show an AltGr
            symbol on the same key, the file uses the other language’s symbol. An English symbol
            remains where the other language’s AltGr level is empty.
          </p>
          <p>Each combined download pairs English with one other language on the board.</p>
          {#each capsExports as item (item.capsLanguage)}
            <p class="paired-source">
              English column “{item.baseLayoutName}”, {item.capsLanguageName} column “{item.capsLayoutName}”.
            </p>
            <div class="row-actions">
              <button type="button" class="primary" onclick={() => downloadCapsKlc(item)}>
                Download {item.baseLanguageName} + {item.capsLanguageName} .klc
              </button>
            </div>
          {/each}
        </section>
        <h3 class="files-heading">One language per file</h3>
      {/if}

      {#each exports as item (item.layoutId)}
        <section class="layout-card">
          <h3>
            <span class="flag" aria-hidden="true"><LangFlag language={item.language} /></span>
            {item.languageName}
            <span class="profile-name">“{item.name}”</span>
          </h3>
          <div class="row-actions">
            <button type="button" class="primary" onclick={() => downloadKlc(item.layoutId, item.name)}>
              Download .klc
            </button>
          </div>
        </section>
      {/each}

      <div class="dialog-foot">
        <button type="button" class="secondary" onclick={closeSheet}>Close</button>
      </div>
    </div>
  </Modal>
{/if}

{#if editor.altGrCopyPlan}
  <Modal onBackdrop={() => editor.cancelAltGrCopy()}>
    <div
      class="install-dialog align-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="altgr-copy-title"
    >
      <header class="dialog-head">
        <div>
          <h2 id="altgr-copy-title">Copy AltGr from {alignExtraName}</h2>
          <p class="lede">
            AltGr and AltGr+Shift are copied onto {alignBaseName} where {alignExtraName} has a
            symbol. Empty {alignExtraName} cells stay as they are. Letters on the main shift levels
            are not copied. {alignBaseName} is saved as your layout, so the Linux
            <code>symbols/au</code> section matches the AltGr the combined Windows file keeps.
          </p>
        </div>
      </header>
      {#if editor.altGrCopyPlan.length === 0}
        <p>AltGr already matches.</p>
      {:else}
        {#if altGrReplacements.length}
          <h3 class="files-heading">Replaced on {alignBaseName}</h3>
          <ul class="align-list">
            {#each altGrReplacements.slice(0, 40) as edit (`${edit.zmk}:${edit.level}`)}
              <li>{formatAltGrCopyLine(edit)}</li>
            {/each}
            {#if altGrReplacements.length > 40}
              <li>and {altGrReplacements.length - 40} more</li>
            {/if}
          </ul>
        {/if}
        {#if altGrFills.length}
          <h3 class="files-heading">Filled where {alignBaseName} was empty</h3>
          <ul class="align-list">
            {#each altGrFills.slice(0, 40) as edit (`${edit.zmk}:${edit.level}`)}
              <li>{formatAltGrCopyLine(edit)}</li>
            {/each}
            {#if altGrFills.length > 40}
              <li>and {altGrFills.length - 40} more</li>
            {/if}
          </ul>
        {/if}
      {/if}
      <div class="dialog-foot">
        <button type="button" class="secondary" onclick={() => editor.cancelAltGrCopy()}>
          Cancel
        </button>
        <button
          type="button"
          class="primary"
          disabled={editor.altGrCopyPlan.length === 0 || editor.altGrCopyBusy}
          onclick={() => editor.confirmAltGrCopy()}
        >
          Copy
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  .host-pipeline {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin: 5px;
    color: #555;
    font-size: 100%;
  }

  .label {
    white-space: nowrap;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .status {
    min-width: 4.2em;
    color: #777;
    font-size: 90%;
  }

  .host-pipeline.dirty .status {
    color: #664d03;
    font-weight: 600;
  }

  .download {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    margin: 0;
    padding: 0 8px 0 6px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #f3f3f3;
    color: #333;
    font: inherit;
    font-size: 90%;
    cursor: pointer;
  }

  .download:hover:not(:disabled) {
    background: #fff;
    border-color: #1d6f8a;
    color: #1d6f8a;
  }

  .download:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .tool {
    display: inline-flex;
    align-items: center;
    height: 28px;
    margin: 0;
    padding: 0 8px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #f3f3f3;
    color: #333;
    font: inherit;
    font-size: 90%;
    cursor: pointer;
    white-space: nowrap;
  }

  .tool:hover:not(:disabled) {
    background: #fff;
    border-color: #1d6f8a;
    color: #1d6f8a;
  }

  .tool.on {
    background: #fff;
    border-color: #1d6f8a;
    color: #1d6f8a;
  }

  .tool:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .tool.icon {
    width: 28px;
    justify-content: center;
    padding: 0;
  }

  .tool.icon img {
    display: block;
    width: 22px;
    height: 22px;
  }

  /* #actions paints every button as a green action. Toggles follow the legend
     chips: quiet while off, white with a teal edge while on, flat when unavailable. */
  :global(#actions button.toggle) {
    background: #f3f3f3;
    color: #333;
    border: 1px solid #c4c4c4;
    border-radius: 6px;
    box-shadow: none;
  }

  :global(#actions button.toggle:hover:not(:disabled):not([aria-pressed='true'])) {
    background: #fff;
    border-color: #1d6f8a;
    color: #1d6f8a;
  }

  :global(#actions button.toggle[aria-pressed='true']:not(:disabled)) {
    background: #fff;
    color: #1d6f8a;
    border: 2px solid #1d6f8a;
  }

  :global(#actions button.toggle:disabled) {
    background: #e4e4e4;
    color: #9a9a9a;
    border: 1px solid #e4e4e4;
    opacity: 0.55;
    cursor: not-allowed;
  }

  .align-legend {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 75%;
    color: #555;
    white-space: nowrap;
  }

  .align-legend .moved {
    border-bottom: 2px solid #c47b00;
  }

  .align-legend .win {
    padding: 0 3px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1.5px #b42318;
    color: #9a3412;
  }

  .align-list {
    max-height: 180px;
    margin: 0 0 10px;
    padding-left: 1.2em;
    overflow: auto;
    font-size: 13px;
  }

  .os-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border-radius: 2px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .dl-label {
    white-space: nowrap;
  }

  .install-dialog {
    box-sizing: border-box;
    width: min(720px, 94vw);
    max-height: calc(100vh - 96px);
    overflow-x: hidden;
    overflow-y: auto;
    padding: 16px 18px 14px;
    border-radius: 10px;
    background: #f7f4ee;
    color: #333;
    font-family: Quicksand, avenir, sans-serif;
    box-shadow:
      0 0 0 1px rgba(40, 36, 30, 0.12),
      0 12px 32px rgba(40, 36, 30, 0.22);
  }

  .dialog-head {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .dialog-logo {
    flex-shrink: 0;
    border-radius: 4px;
    image-rendering: pixelated;
  }

  .install-dialog h2 {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 700;
  }

  .lede {
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
    color: #555;
  }

  .lede code,
  .steps code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
  }

  .steps {
    margin: 0 0 14px;
    padding-left: 1.25em;
    font-size: 13px;
    line-height: 1.4;
  }

  .steps li + li {
    margin-top: 6px;
  }

  .paired {
    margin: 0 0 14px;
    padding: 12px 12px 10px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid rgba(29, 111, 138, 0.45);
  }

  .paired h3,
  .files-heading {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
  }

  .files-heading {
    margin-top: 2px;
  }

  .paired p,
  .paired li {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.45;
    color: #333;
  }

  .paired ul {
    margin: 0 0 8px;
    padding-left: 1.2em;
  }

  .paired li + li {
    margin-top: 2px;
  }

  .paired-source {
    color: #555;
  }

  .paired .row-actions {
    margin-bottom: 8px;
  }

  .layout-card {
    margin: 0 0 12px;
    padding: 10px 10px 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(40, 36, 30, 0.1);
  }

  .layout-card h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 700;
  }

  .flag {
    display: inline-flex;
    align-items: center;
    line-height: 0;
  }

  .profile-name {
    font-weight: 500;
    color: #555;
  }

  .card-tip {
    margin: 0 0 8px;
    font-size: 12px;
    line-height: 1.4;
    color: #555;
  }

  .card-tip.tip-ru {
    color: #4a4540;
  }

  .module {
    margin-left: auto;
    color: #7a746c;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
    font-weight: 500;
  }

  .path-label {
    display: block;
    margin: 0 0 3px;
    font-size: 11px;
    color: #7a746c;
  }

  .path-row {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .path-input {
    flex: 1;
    min-width: 0;
    height: 28px;
    margin: 0;
    padding: 0 8px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: #333;
  }

  .section-preview {
    box-sizing: border-box;
    max-height: 110px;
    margin: 4px 0 8px;
    padding: 8px;
    overflow: auto;
    border-radius: 6px;
    background: #1e1e1e;
    color: #d6d6d6;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.35;
    white-space: pre;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .row-actions.bulk {
    margin-bottom: 8px;
  }

  .primary,
  .secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    margin: 0;
    padding: 0 12px;
    border-radius: 8px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    text-decoration: none;
  }

  .primary {
    border: 0;
    background: #1d6f8a;
    color: #fff;
  }

  .secondary {
    border: 1px solid #ccc;
    background: #f3f3f3;
    color: #333;
  }

  .secondary:hover:not(:disabled),
  .primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  .secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .copy-note {
    margin: 8px 0 0;
    font-size: 12px;
    color: #1d6f8a;
  }

  .dialog-foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid rgba(40, 36, 30, 0.1);
  }
</style>
