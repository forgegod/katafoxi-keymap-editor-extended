<script lang="ts">
  import type { HostLanguageId } from '@keymap-editor/keymap-core'
  import logoWindows from '../assets/logo-windows.png'
  import Modal from './Common/Modal.svelte'
  import Button from './Common/Button.svelte'
  import LangFlag from './LangFlag.svelte'
  import type { LayoutExportItem } from './LayoutExportCard.svelte'
  import './HostInstallDialog.css'

  type CapsExportItem = {
    capsLanguage: HostLanguageId
    capsLanguageName: string
    baseLanguageName: string
    baseLayoutName: string
    capsLayoutName: string
    fileStem: string
  }

  interface Props {
    exports: LayoutExportItem[]
    capsExports: CapsExportItem[]
    separateLayoutsNote: boolean
    pairedLayoutName: (baseName: string, capsName: string, language: string) => string
    onDownloadKlc: (layoutId: string, name: string) => void
    onDownloadCapsKlc: (item: CapsExportItem) => void
    onClose: () => void
  }

  let {
    exports,
    capsExports,
    separateLayoutsNote,
    pairedLayoutName,
    onDownloadKlc,
    onDownloadCapsKlc,
    onClose
  }: Props = $props()

  const MSKLC_URL =
    'https://www.microsoft.com/en-us/download/details.aspx?id=102134'
</script>

<Modal onBackdrop={onClose} ariaLabelledby="windows-install-title">
  <div class="install-dialog">
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

    {#if exports.length === 0 && capsExports.length === 0}
      <p class="empty-exports" role="status">
        No custom host layout yet. Alt+click a key to edit symbols, then download a
        <code>.klc</code> file here.
      </p>
    {/if}

    {#if capsExports.length > 0}
      <section class="paired" aria-labelledby="windows-paired-title">
        <h3 id="windows-paired-title">Two alphabets in one layout</h3>
        <p>
          For Russian, Ukrainian, or Bulgarian, this file stays an English keyboard in Windows.
          Caps Lock types the other alphabet, so one English entry in the language list covers
          both.
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
          empty, so the national layout is where those characters live. This file writes that
          national AltGr. When both columns show an AltGr symbol on the same key, the file uses
          the other language’s symbol. An English symbol remains where the other language’s AltGr
          level is empty.
        </p>
        <p>Each combined download pairs English with one Cyrillic language on the board.</p>
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
            <Button variant="accent" onclick={() => onDownloadCapsKlc(item)}>
              Download {item.baseLanguageName} + {item.capsLanguageName} .klc
            </Button>
          </div>
        {/each}
      </section>
      <h3 class="files-heading">One language per file</h3>
    {:else if separateLayoutsNote && exports.length > 0}
      <p class="separate-note" role="note">
        Dense Latin layouts (French, German, Polish, Spanish, …) and Greek fill every shift
        level (often with dead keys). Caps Lock pairing with English does not fit those.
        Download a separate <code>.klc</code> for each language below and switch with Win+Space.
      </p>
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
          <Button variant="accent" onclick={() => onDownloadKlc(item.layoutId, item.name)}>
            Download .klc
          </Button>
        </div>
      </section>
    {/each}

    <div class="dialog-foot">
      <Button variant="outline" onclick={onClose}>Close</Button>
    </div>
  </div>
</Modal>
