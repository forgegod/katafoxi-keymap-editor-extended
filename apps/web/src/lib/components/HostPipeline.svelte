<script lang="ts">
  import { editor } from '../editor.svelte.js'
  import logoLinux from '../assets/logo-linux.png'
  import logoWindows from '../assets/logo-windows.png'
  import Modal from './Common/Modal.svelte'

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
            <span class="flag" aria-hidden="true">{item.flag}</span>
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
            Windows custom layouts go through Microsoft Keyboard Layout Creator (MSKLC): edit →
            build an installer → install → reboot. Automated <code>.klc</code> export is not ready
            yet.
          </p>
        </div>
      </header>

      <ol class="steps">
        <li>
          Install
          <a href={MSKLC_URL} target="_blank" rel="noopener noreferrer">MSKLC from Microsoft</a>
          if you do not have it.
        </li>
        <li>Create or edit the layout in MSKLC (use the Linux section text as a glyph reference).</li>
        <li>Build the installer from MSKLC, then run it.</li>
        <li>Sign out or reboot so Windows loads the new layout.</li>
        <li>
          Two languages can share one Windows layout; a third usually needs its own — set switching
          modes in Language settings.
        </li>
      </ol>

      <div class="row-actions">
        <a class="primary link-btn" href={MSKLC_URL} target="_blank" rel="noopener noreferrer">
          Open MSKLC download
        </a>
        <button
          type="button"
          class="secondary"
          disabled
          title="KLC export is not implemented yet"
        >
          Download .klc file
        </button>
      </div>
      <p class="aside">
        Active host profiles:
        {#each exports as item, i (item.layoutId)}
          {#if i > 0}, {/if}{item.flag}
          {item.languageName} (“{item.name}”)
        {/each}
      </p>

      <div class="dialog-foot">
        <button type="button" class="secondary" onclick={closeSheet}>Close</button>
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
    align-items: baseline;
    gap: 6px 8px;
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 700;
  }

  .flag {
    font-size: 16px;
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
  .secondary,
  .link-btn {
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

  .primary,
  .link-btn.primary {
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
  .primary:hover:not(:disabled),
  .link-btn:hover {
    filter: brightness(1.05);
  }

  .secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .aside {
    margin: 10px 0 0;
    font-size: 12px;
    color: #666;
    line-height: 1.35;
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
