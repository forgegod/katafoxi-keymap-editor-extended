<script lang="ts">
  import { editor } from '../editor.svelte.js'
  import { pairedKbdId } from '@keymap-editor/keymap-core'
  import logoLinux from '../assets/logo-linux.png'
  import logoWindows from '../assets/logo-windows.png'
  import Modal from './Common/Modal.svelte'
  import LangFlag from './LangFlag.svelte'

  type InstallSheet = 'linux' | 'windows' | null

  let sheet = $state<InstallSheet>(null)
  let copyNote = $state('')
  /** Last paired-layout version written for each caps language. The next download uses +1. */
  let pairedVersion = $state<Record<string, number>>({})

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
  const statusTitle = $derived(
    dirty ? 'User layout ready to install' : 'No user layout to install'
  )
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
  $effect(() => {
    if (editor.hostLegend.columns.length < 3 && editor.multilangView) {
      editor.multilangView = false
    }
  })
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

  function pairedVersionKey(language: string): string {
    return `klc-paired-version:${language}`
  }

  function readPairedVersion(language: string): number {
    try {
      const raw = Number(localStorage.getItem(pairedVersionKey(language)) || '0')
      if (!Number.isInteger(raw) || raw < 1) return 0
      return Math.min(raw, 99)
    } catch {
      return 0
    }
  }

  function upcomingPairedVersion(language: string): number {
    const prev = pairedVersion[language] ?? 0
    return prev >= 99 ? 1 : prev + 1
  }

  function pairedLayoutName(baseName: string, capsName: string, language: string): string {
    return pairedKbdId(baseName, capsName, upcomingPairedVersion(language))
  }

  function openSheet(next: 'linux' | 'windows') {
    if (!dirty) return
    copyNote = ''
    if (next === 'windows') {
      const versions: Record<string, number> = {}
      for (const item of editor.listCapsAlphabetKlcExports()) {
        versions[item.capsLanguage] = readPairedVersion(item.capsLanguage)
      }
      pairedVersion = versions
    }
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
    const version = upcomingPairedVersion(item.capsLanguage)
    try {
      localStorage.setItem(pairedVersionKey(item.capsLanguage), String(version))
    } catch {
      /* private mode: the file still carries this version */
    }
    pairedVersion = { ...pairedVersion, [item.capsLanguage]: version }
    const file = editor.exportCapsAlphabetKlc(item.capsLanguage, version)
    if (!file) return
    downloadBytes(file.bytes, safeFileName(file.kbdId, 'klc'))
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
  <span class="lane-label" title="Host layout: install results on the OS">Host</span>
  <span
    class="chrome-status"
    class:dirty
    class:clean={!dirty}
    aria-live="polite"
    aria-label={statusTitle}
    title={statusTitle}
  >
    <span class="status-dot" aria-hidden="true"></span>
    {#if dirty}Changed{/if}
  </span>

  <button
    type="button"
    class="download"
    class:ready={dirty}
    aria-label={dirty ? 'Install host layout on Linux' : 'No host changes to install'}
    title={dirty ? 'Open Linux install guide' : 'No host changes to install'}
    disabled={!dirty}
    onclick={() => openSheet('linux')}
  >
    <img class="os-icon" src={logoLinux} alt="" width="20" height="20" />
    <span class="dl-label">Linux</span>
  </button>

  <button
    type="button"
    class="download"
    class:ready={dirty}
    aria-label={dirty ? 'Install host layout on Windows' : 'No host changes to install'}
    title={dirty ? 'Open Windows install guide' : 'No host changes to install'}
    disabled={!dirty}
    onclick={() => openSheet('windows')}
  >
    <img class="os-icon" src={logoWindows} alt="" width="20" height="20" />
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
        <li>
          In MSKLC, use File → Load Source File, then Project → Build DLL and Setup Package. If a
          custom layout from an earlier build is still installed, remove it from that language’s
          keyboard list first. The layout name is at most 8 letters and digits. Windows keeps the
          old DLL when that name stays the same, so leave the new name that is already in the file.
        </li>
        <li>
          Run the installer, then sign out. If the previous characters are still there, reboot.
        </li>
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
          <p>
            The file’s layout name looks like EngRus01: three letters from each language and a
            two-digit version. The next download of the same pair uses the next number. Remove the
            previous custom layout from the English keyboard list before you install this one.
          </p>
          {#each capsExports as item (item.capsLanguage)}
            <p class="paired-source">
              Layout name {pairedLayoutName(item.baseLanguageName, item.capsLanguageName, item.capsLanguage)}.
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

<style>
  .host-pipeline {
    display: inline-flex;
    flex-wrap: nowrap;
    align-items: flex-end;
    gap: 6px 8px;
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-md);
  }

  .download {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    box-sizing: border-box;
    height: 26px;
    margin: 0;
    padding: 0 8px 0 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-sunken);
    color: var(--text);
    font: inherit;
    font-size: var(--font-md);
    cursor: pointer;
  }

  .download:hover:not(:disabled) {
    background: var(--surface);
    border-color: var(--accent);
    color: var(--accent);
  }

  .download:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .os-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 2px;
    object-fit: contain;
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
    background: var(--paper);
    color: var(--text);
    font-family: Quicksand, avenir, sans-serif;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--paper-shade) 12%, transparent),
      0 12px 32px color-mix(in srgb, var(--paper-shade) 22%, transparent);
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
  }

  .install-dialog h2 {
    margin: 0 0 4px;
    font-size: var(--font-xl);
    font-weight: 700;
  }

  .lede {
    margin: 0;
    font-size: var(--font-md);
    line-height: 1.4;
    color: var(--text-muted);
  }

  .lede code,
  .steps code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
  }

  .steps {
    margin: 0 0 14px;
    padding-left: 1.25em;
    font-size: var(--font-md);
    line-height: 1.4;
  }

  .steps li + li {
    margin-top: 6px;
  }

  .paired {
    margin: 0 0 14px;
    padding: 12px 12px 10px;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .paired h3,
  .files-heading {
    margin: 0 0 8px;
    font-size: var(--font-lg);
    font-weight: 700;
  }

  .files-heading {
    margin-top: 2px;
  }

  .paired p,
  .paired li {
    margin: 0 0 8px;
    font-size: var(--font-md);
    line-height: 1.45;
    color: var(--text);
  }

  .paired ul {
    margin: 0 0 8px;
    padding-left: 1.2em;
  }

  .paired li + li {
    margin-top: 2px;
  }

  .paired-source {
    color: var(--text-muted);
  }

  .paired .row-actions {
    margin-bottom: 8px;
  }

  .layout-card {
    margin: 0 0 12px;
    padding: 10px 10px 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid color-mix(in srgb, var(--paper-shade) 10%, transparent);
  }

  .layout-card h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin: 0 0 8px;
    font-size: var(--font-lg);
    font-weight: 700;
  }

  .flag {
    display: inline-flex;
    align-items: center;
    line-height: 0;
  }

  .profile-name {
    font-weight: 500;
    color: var(--text-muted);
  }

  .card-tip {
    margin: 0 0 8px;
    font-size: var(--font-sm);
    line-height: 1.4;
    color: var(--text-muted);
  }

  .card-tip.tip-ru {
    color: var(--paper-ink-strong);
  }

  .module {
    margin-left: auto;
    color: var(--paper-ink-subtle);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
    font-weight: 500;
  }

  .path-label {
    display: block;
    margin: 0 0 3px;
    font-size: var(--font-xs);
    color: var(--paper-ink-subtle);
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
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--font-sm);
    color: var(--text);
  }

  .section-preview {
    box-sizing: border-box;
    max-height: 110px;
    margin: 4px 0 8px;
    padding: 8px;
    overflow: auto;
    border-radius: 6px;
    background: var(--code-bg);
    color: var(--code-ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--font-xs);
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
    font-size: var(--font-md);
    cursor: pointer;
    text-decoration: none;
  }

  .primary {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }

  .secondary {
    border: 1px solid var(--border);
    background: var(--surface-sunken);
    color: var(--text);
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
    font-size: var(--font-sm);
    color: var(--accent);
  }

  .dialog-foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--paper-shade) 10%, transparent);
  }
</style>
