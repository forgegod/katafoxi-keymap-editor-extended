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
  const canStore = true

  type XkbSectionChoice = { section: string; name: string }

  let importing = $state(false)
  let importText = $state('')
  let importFileName = $state('paste')
  let importSections = $state<XkbSectionChoice[]>([])
  let importSection = $state('')
  let importError = $state('')

  $effect(() => {
    if (open) return
    importing = false
    importText = ''
    importFileName = 'paste'
    importSections = []
    importSection = ''
    importError = ''
  })

  function beginImport(event: MouseEvent) {
    event.stopPropagation()
    importing = true
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
      importError = 'В файле нет секций xkb_symbols'
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
      importError = 'Вставьте текст xkb или выберите файл'
      return
    }
    if (importSections.length === 0) {
      applyImportText(importText, importFileName)
      if (importSections.length === 0) return
    }
    if (importSections.length > 1 && !importSection) {
      importError = 'Выберите секцию'
      return
    }
    const section = importSection || importSections[0]?.section
    if (!section) {
      importError = 'Выберите секцию'
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
    importing = false
    onClose()
  }

  function currentLabel(): string {
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

  let menuEl = $state<HTMLDivElement | undefined>()

  $effect(() => {
    if (!open) return
    function handle(event: PointerEvent) {
      if (event.target instanceof Node && menuEl?.contains(event.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  })
</script>

<div class="profile-menu" bind:this={menuEl}>
  <button
    type="button"
    class="profile-trigger"
    aria-label="Профиль {languageName}"
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={onToggle}
  >
    {currentLabel()}
  </button>
  {#if open && importing}
    <div class="profile-import" role="dialog" aria-label="Импортировать xkb">
      <input
        type="file"
        aria-label="Файл xkb"
        onchange={event => void onImportFile(event)}
      />
      <p class="profile-import-hint">Файлы символов xkb часто без расширения, например au или ru.</p>
      <textarea
        aria-label="Текст xkb"
        placeholder="Вставить xkb…"
        bind:value={importText}
        oninput={() => {
          importError = ''
          const sections = listXkbSections(importText)
          importSections = sections
          if (sections.length > 0 && !sections.some(item => item.section === importSection)) {
            importSection = sections[0].section
          }
          if (importFileName === '') importFileName = 'paste'
        }}
      ></textarea>
      {#if importSections.length > 1}
        <select
          aria-label="Секция xkb"
          value={importSection}
          onchange={event => (importSection = event.currentTarget.value)}
        >
          {#each importSections as item (item.section)}
            <option value={item.section}>{item.name}</option>
          {/each}
        </select>
      {/if}
      {#if importError}
        <p class="profile-import-error" role="alert">{importError}</p>
      {/if}
      <div class="profile-import-actions">
        <button type="button" onclick={() => void submitImport()}>Импортировать</button>
        <button type="button" onclick={() => (importing = false)}>Назад</button>
      </div>
    </div>
  {:else if open}
    <ul class="profile-list" role="listbox" aria-label="Профиль {languageName}">
      {#each customs as profile (profile.id)}
        <li class="profile-row">
          <button
            type="button"
            class="profile-item"
            class:selected={profile.id === activeId}
            role="option"
            aria-selected={profile.id === activeId}
            onclick={() => selectLayout(profile.id)}
          >
            {profile.layoutName}
          </button>
          {#if canStore}
          <button
            type="button"
            class="profile-icon"
            title="Скопировать профиль"
            aria-label="Скопировать {profile.layoutName}"
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
            title="Переименовать профиль"
            aria-label="Переименовать {profile.layoutName}"
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
            title="Удалить профиль"
            aria-label="Удалить {profile.layoutName}"
            onclick={event => deleteCustom(profile.id, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
          {/if}
        </li>
      {/each}
      {#if customs.length > 0 && (shelves.primary || shelves.systems.length > 0)}
        <li class="profile-sep" aria-hidden="true"></li>
      {/if}
      {#if shelves.primary}
        {@const primary = shelves.primary}
        <li class="profile-row">
          <button
            type="button"
            class="profile-item"
            class:selected={primary.id === activeId}
            role="option"
            aria-selected={primary.id === activeId}
            onclick={() => selectLayout(primary.id)}
          >
            {hostLayoutChoiceLabel(primary)}
          </button>
          {#if canStore}
          <button
            type="button"
            class="profile-icon"
            title="Скопировать профиль"
            aria-label="Скопировать {hostLayoutChoiceLabel(primary)}"
            onclick={event => copyLayout(primary, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="1.5" />
              <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
            </svg>
          </button>
          {/if}
        </li>
      {/if}
      {#each shelves.systems as choice (choice.id)}
        <li class="profile-row">
          <button
            type="button"
            class="profile-item"
            class:selected={choice.id === activeId}
            role="option"
            aria-selected={choice.id === activeId}
            onclick={() => selectLayout(choice.id)}
          >
            {hostLayoutChoiceLabel(choice)}
          </button>
          {#if canStore}
          <button
            type="button"
            class="profile-icon"
            title="Скопировать профиль"
            aria-label="Скопировать {hostLayoutChoiceLabel(choice)}"
            onclick={event => copyLayout(choice, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="1.5" />
              <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
            </svg>
          </button>
          {/if}
        </li>
      {/each}
      <li class="profile-sep" aria-hidden="true"></li>
      <li class="profile-row">
        <button type="button" class="profile-action" onclick={beginImport}>
          Импортировать xkb…
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
    max-width: 9.5rem;
    min-height: 24px;
    padding: 1px 18px 1px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%23555' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")
      no-repeat right 6px center;
    color: inherit;
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
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
    background: #fff;
    border: 1px solid #ccc;
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
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .profile-item.selected {
    font-weight: 600;
  }

  .profile-item:hover,
  .profile-icon:hover {
    background: rgba(29, 111, 138, 0.08);
  }

  .profile-sep {
    height: 1px;
    margin: 4px 8px;
    background: #e4e4e4;
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
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    color: #333;
    cursor: pointer;
  }

  .profile-icon.stub {
    background: transparent;
    color: #555;
  }

  .profile-icon.danger {
    color: #842029;
    border-color: #e2b6bb;
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
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .profile-action:hover {
    background: rgba(29, 111, 138, 0.08);
  }

  .profile-import {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 8;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 16rem;
    padding: 8px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
  }

  .profile-import textarea,
  .profile-import select,
  .profile-import input[type='file'] {
    box-sizing: border-box;
    width: 100%;
    font: inherit;
    font-size: 12px;
  }

  .profile-import textarea {
    min-height: 7rem;
    resize: vertical;
  }

  .profile-import-hint {
    margin: 0;
    color: #555;
    font-size: 11px;
  }

  .profile-import-error {
    margin: 0;
    color: #842029;
    font-size: 12px;
  }

  .profile-import-actions {
    display: flex;
    gap: 6px;
  }

  .profile-import-actions button {
    cursor: pointer;
    border: none;
    border-radius: 5px;
    padding: 4px 10px;
    font: inherit;
    font-size: 12px;
  }

  .profile-import-actions button:first-child {
    background: var(--hover-selection);
    color: #fff;
  }

  .profile-import-actions button:last-child {
    background: #eee;
    color: #333;
  }
</style>
