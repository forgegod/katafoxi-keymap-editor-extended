<script lang="ts">
  import {
    hostLayoutChoice,
    hostLayoutChoiceLabel,
    hostLayoutShelves,
    listXkbSections,
    type HostLanguageId,
    type HostLayoutChoice
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import { isUserHostLayoutId } from '../host-layout-store.js'
  import { clickOutside } from '../actions/click-outside'
  import { pushEscapeHandler } from '../escape-stack'
  import ProfileImportKlc from './ProfileImportKlc.svelte'
  import ProfileImportXkb from './ProfileImportXkb.svelte'

  interface Props {
    language: HostLanguageId
    languageName: string
    open: boolean
    onToggle: () => void
    onClose: () => void
  }

  let { language, languageName, open, onToggle, onClose }: Props = $props()

  const shelves = $derived.by(() => {
    editor.userLayouts
    return hostLayoutShelves(language)
  })
  const customs = $derived(shelves.users)
  const activeId = $derived(editor.activeProfileId(language))

  type XkbSectionChoice = { section: string; name: string }

  let importKind = $state<'xkb' | 'klc' | null>(null)
  let importText = $state('')
  let importFileName = $state('paste')
  let importSections = $state<XkbSectionChoice[]>([])
  let importSection = $state('')
  let importError = $state('')
  let importPaneEl = $state<HTMLDivElement | undefined>()

  const IMPORT_FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

  $effect(() => {
    if (open) return
    importKind = null
    importText = ''
    importFileName = 'paste'
    importSections = []
    importSection = ''
    importError = ''
  })

  $effect(() => {
    if (!open) return
    return pushEscapeHandler(() => {
      if (importKind) {
        importKind = null
        return
      }
      onClose()
    })
  })

  $effect(() => {
    if (!open || importKind == null || !importPaneEl) return
    const focusable = importPaneEl.querySelector(IMPORT_FOCUSABLE)
    if (focusable instanceof HTMLElement) focusable.focus({ preventScroll: true })
    else importPaneEl.focus({ preventScroll: true })
  })

  function beginImport(kind: 'xkb' | 'klc', event: MouseEvent) {
    event.stopPropagation()
    importKind = kind
    importText = ''
    importFileName = 'paste'
    importSections = []
    importSection = ''
    importError = ''
  }

  function applyImportText(text: string, fileName: string) {
    importText = text
    importFileName = fileName
    importSections = listXkbSections(text)
    importError = ''
    if (importSections.length === 0) {
      importSection = ''
      importError = 'No xkb_symbols sections in this file'
      return
    }
    importSection = importSections[0].section
  }

  async function onImportFile(event: Event) {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement)) return
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    applyImportText(await file.text(), file.name)
    if (importSections.length === 1) await submitImport()
  }

  async function submitImport() {
    if (!importText.trim()) {
      importError = 'Paste xkb text or choose a file'
      return
    }
    if (importSections.length === 0) {
      applyImportText(importText, importFileName)
      if (importSections.length === 0) return
    }
    if (importSections.length > 1 && !importSection) {
      importError = 'Choose a section'
      return
    }
    const section = importSection || importSections[0]?.section
    if (!section) {
      importError = 'Choose a section'
      return
    }
    const message = await editor.importHostLayoutFromXkb(
      language,
      importText,
      section,
      importFileName
    )
    if (message) {
      importError = message
      return
    }
    importKind = null
    onClose()
  }

  async function onImportKlcFile(event: Event) {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement)) return
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const message = await editor.importHostLayoutFromKlc(
      language,
      new Uint8Array(await file.arrayBuffer()),
      file.name
    )
    if (message) {
      importError = message
      return
    }
    importKind = null
    onClose()
  }

  async function submitKlcImport() {
    if (!importText.trim()) {
      importError = 'Paste klc text or choose a file'
      return
    }
    const message = await editor.importHostLayoutFromKlc(language, importText, importFileName)
    if (message) {
      importError = message
      return
    }
    importKind = null
    onClose()
  }

  function shortProfileLabel(full: string): string {
    const paren = full.match(/\(([^)]+)\)\s*$/)
    if (paren) return paren[1]
    return full
  }

  function currentLabel(): string {
    const user = editor.profilesForLanguage(language).find(profile => profile.id === activeId)
    if (user) return shortProfileLabel(user.name)
    const choice = hostLayoutChoice(activeId)
    return choice ? shortProfileLabel(hostLayoutChoiceLabel(choice)) : ''
  }

  function currentFullLabel(): string {
    const user = editor.profilesForLanguage(language).find(profile => profile.id === activeId)
    if (user) return user.name
    const choice = hostLayoutChoice(activeId)
    return choice ? hostLayoutChoiceLabel(choice) : ''
  }

  function selectLayout(id: string) {
    void editor.selectLanguageProfile(language, id)
    onClose()
  }

  function copyLayout(choice: HostLayoutChoice, event: MouseEvent) {
    event.stopPropagation()
    onClose()
    editor.beginCopyHostProfile(language, choice.id)
  }

  function copyCustom(id: string, event: MouseEvent) {
    event.stopPropagation()
    onClose()
    editor.beginCopyHostProfile(language, id)
  }

  function renameCustom(id: string, event: MouseEvent) {
    event.stopPropagation()
    onClose()
    editor.beginRenameHostProfile(language, id)
  }

  function deleteCustom(id: string, event: MouseEvent) {
    event.stopPropagation()
    onClose()
    editor.beginDeleteHostProfile(language, id)
  }

  function exportFileName(name: string): string {
    const safe = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'layout'
    return `${safe}.xkb`
  }

  function downloadXkb(text: string, name: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFileName(name)
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function exportLayout(id: string) {
    const exported = editor.exportUserHostLayoutXkb(id)
    if (!exported) return
    downloadXkb(exported.text, exported.name)
    onClose()
  }

  function exportCustom(id: string, event: MouseEvent) {
    event.stopPropagation()
    exportLayout(id)
  }

  function exportActive(event: MouseEvent) {
    event.stopPropagation()
    if (!isUserHostLayoutId(activeId)) return
    exportLayout(activeId)
  }

</script>

<div
  class="profile-menu"
  use:clickOutside={{ enabled: open, handler: onClose }}
>
  <button
    type="button"
    class="profile-trigger"
    aria-label="Profile {languageName}: {currentFullLabel()}"
    title={currentFullLabel()}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={onToggle}
  >
    {currentLabel()}
  </button>
  {#if open && importKind === 'xkb'}
    <ProfileImportXkb
      bind:importText
      bind:importSection
      bind:importPaneEl
      {importSections}
      {importError}
      onFile={event => void onImportFile(event)}
      onTextInput={() => {
        importError = ''
        const sections = listXkbSections(importText)
        importSections = sections
        if (sections.length > 0 && !sections.some(item => item.section === importSection)) {
          importSection = sections[0].section
        }
        if (importFileName === '') importFileName = 'paste'
      }}
      onSectionChange={section => (importSection = section)}
      onSubmit={() => void submitImport()}
      onBack={() => (importKind = null)}
    />
  {:else if open && importKind === 'klc'}
    <ProfileImportKlc
      bind:importText
      bind:importPaneEl
      {importError}
      onFile={event => void onImportKlcFile(event)}
      onTextInput={() => (importError = '')}
      onSubmit={() => void submitKlcImport()}
      onBack={() => (importKind = null)}
    />
  {:else if open}
    <ul class="profile-list" role="menu" aria-label="Profile {languageName}">
      {#each customs as profile (profile.id)}
        <li class="profile-row" role="none">
          <button
            type="button"
            class="profile-item"
            class:selected={profile.id === activeId}
            role="menuitem"
            aria-current={profile.id === activeId ? 'true' : undefined}
            onclick={() => selectLayout(profile.id)}
          >
            {profile.layoutName}
          </button>
          <button
            type="button"
            class="profile-icon"
            role="menuitem"
            title="Export xkb"
            aria-label="Export {profile.layoutName}"
            onclick={event => exportCustom(profile.id, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M8 11l4 4 4-4" />
              <path d="M5 19h14" />
            </svg>
          </button>
          <button
            type="button"
            class="profile-icon"
            role="menuitem"
            title="Copy profile"
            aria-label="Copy {profile.layoutName}"
            onclick={event => copyCustom(profile.id, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="1.5" />
              <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
            </svg>
          </button>
          <button
            type="button"
            class="profile-icon stub"
            role="menuitem"
            title="Rename profile"
            aria-label="Rename {profile.layoutName}"
            onclick={event => renameCustom(profile.id, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20h4L18 10l-4-4L4 16v4z" />
              <path d="M13 7l4 4" />
            </svg>
          </button>
          <button
            type="button"
            class="profile-icon stub danger"
            role="menuitem"
            title="Delete profile"
            aria-label="Delete {profile.layoutName}"
            onclick={event => deleteCustom(profile.id, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </li>
      {/each}
      {#if customs.length > 0 && (shelves.primary || shelves.systems.length > 0)}
        <li class="profile-sep" role="separator"></li>
      {/if}
      {#if shelves.primary}
        {@const primary = shelves.primary}
        <li class="profile-row" role="none">
          <button
            type="button"
            class="profile-item"
            class:selected={primary.id === activeId}
            role="menuitem"
            aria-current={primary.id === activeId ? 'true' : undefined}
            onclick={() => selectLayout(primary.id)}
          >
            {hostLayoutChoiceLabel(primary)}
          </button>
          <button
            type="button"
            class="profile-icon"
            role="menuitem"
            title="Copy profile"
            aria-label="Copy {hostLayoutChoiceLabel(primary)}"
            onclick={event => copyLayout(primary, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="1.5" />
              <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
            </svg>
          </button>
        </li>
      {/if}
      {#each shelves.systems as choice (choice.id)}
        <li class="profile-row" role="none">
          <button
            type="button"
            class="profile-item"
            class:selected={choice.id === activeId}
            role="menuitem"
            aria-current={choice.id === activeId ? 'true' : undefined}
            onclick={() => selectLayout(choice.id)}
          >
            {hostLayoutChoiceLabel(choice)}
          </button>
          <button
            type="button"
            class="profile-icon"
            role="menuitem"
            title="Copy profile"
            aria-label="Copy {hostLayoutChoiceLabel(choice)}"
            onclick={event => copyLayout(choice, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="1.5" />
              <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
            </svg>
          </button>
        </li>
      {/each}
      <li class="profile-sep" role="separator"></li>
      {#if isUserHostLayoutId(activeId)}
        <li class="profile-row" role="none">
          <button type="button" class="profile-action" role="menuitem" onclick={exportActive}>
            Export xkb
          </button>
        </li>
      {/if}
      <li class="profile-row" role="none">
        <button
          type="button"
          class="profile-action"
          role="menuitem"
          onclick={event => beginImport('xkb', event)}
        >
          Import xkb…
        </button>
      </li>
      <li class="profile-row" role="none">
        <button
          type="button"
          class="profile-action"
          role="menuitem"
          onclick={event => beginImport('klc', event)}
        >
          Import klc…
        </button>
      </li>
    </ul>
  {/if}
</div>

<style>
  .profile-menu {
    position: relative;
  }

  .profile-trigger {
    max-width: 5.5rem;
    min-height: 24px;
    padding: 1px 18px 1px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%23666' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")
      no-repeat right 6px center;
    color: inherit;
    font: inherit;
    font-size: var(--font-sm);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  :global(:root[data-color-scheme='dark']) .profile-trigger {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%23a8adb8' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  }

  .profile-list {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 8;
    min-width: 14rem;
    max-height: min(48rem, 90vh);
    margin: 0;
    padding: 4px 0;
    overflow: auto;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
  }

  .profile-row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px;
  }

  .profile-item {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 4px 8px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--font-sm);
    text-align: left;
    cursor: pointer;
  }

  .profile-item.selected {
    font-weight: 600;
  }

  .profile-item:hover,
  .profile-icon:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .profile-sep {
    height: 1px;
    margin: 4px 8px;
    background: var(--fill);
  }

  .profile-icon {
    width: 22px;
    height: 22px;
    padding: 0;
    margin: 0;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }

  .profile-icon.stub {
    background: transparent;
    color: var(--text-muted);
  }

  .profile-icon.danger {
    color: var(--danger-ink);
    border-color: var(--danger-border);
  }

  .profile-icon svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .profile-action {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 4px 8px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--font-sm);
    text-align: left;
    cursor: pointer;
  }

  .profile-action:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
</style>
