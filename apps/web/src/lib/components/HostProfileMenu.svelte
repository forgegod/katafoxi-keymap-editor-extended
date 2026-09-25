<script lang="ts">
  import {
    builtinProfileIdForChoice,
    hostLayoutChoiceLabel,
    hostLayoutShelves,
    type HostLanguageId,
    type HostLayoutChoice
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import { builtinProfileLabel } from '../host-profiles.js'

  interface Props {
    language: HostLanguageId
    languageName: string
    open: boolean
    onToggle: () => void
    onClose: () => void
  }

  let { language, languageName, open, onToggle, onClose }: Props = $props()

  const shelves = $derived(hostLayoutShelves(language))
  const customs = $derived(editor.profilesForLanguage(language))
  const activeId = $derived(editor.activeProfileId(language))
  const canStore = true

  function currentLabel(): string {
    const builtin = builtinProfileLabel(activeId)
    if (builtin) return builtin
    return customs.find(profile => profile.id === activeId)?.name ?? ''
  }

  function selectBuiltin(choice: HostLayoutChoice) {
    void editor.selectLanguageProfile(language, builtinProfileIdForChoice(choice))
    onClose()
  }

  function selectCustom(id: string) {
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
    const profile = customs.find(item => item.id === id)
    onClose()
    editor.beginCopyHostProfile(language, profile?.layoutId)
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
  {#if open}
    <ul class="profile-list" role="listbox" aria-label="Профиль {languageName}">
      {#each customs as profile (profile.id)}
        <li class="profile-row">
          <button
            type="button"
            class="profile-item"
            class:selected={profile.id === activeId}
            role="option"
            aria-selected={profile.id === activeId}
            onclick={() => selectCustom(profile.id)}
          >
            {profile.name}
          </button>
          {#if canStore}
          <button
            type="button"
            class="profile-icon"
            title="Скопировать профиль"
            aria-label="Скопировать {profile.name}"
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
            aria-label="Переименовать {profile.name}"
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
            aria-label="Удалить {profile.name}"
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
      {#if customs.length > 0 && (shelves.inLayout || shelves.primary || shelves.systems.length > 0)}
        <li class="profile-sep" aria-hidden="true"></li>
      {/if}
      {#if shelves.inLayout}
        <li class="profile-row">
          <button
            type="button"
            class="profile-item"
            class:selected={builtinProfileIdForChoice(shelves.inLayout) === activeId}
            role="option"
            aria-selected={builtinProfileIdForChoice(shelves.inLayout) === activeId}
            onclick={() => selectBuiltin(shelves.inLayout!)}
          >
            {hostLayoutChoiceLabel(shelves.inLayout)}
          </button>
          {#if canStore}
          <button
            type="button"
            class="profile-icon"
            title="Скопировать профиль"
            aria-label="Скопировать {hostLayoutChoiceLabel(shelves.inLayout)}"
            onclick={event => copyLayout(shelves.inLayout!, event)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="12" rx="1.5" />
              <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
            </svg>
          </button>
          {/if}
        </li>
      {/if}
      {#if shelves.inLayout && (shelves.primary || shelves.systems.length > 0)}
        <li class="profile-sep" aria-hidden="true"></li>
      {/if}
      {#if shelves.primary}
        <li class="profile-row">
          <button
            type="button"
            class="profile-item"
            class:selected={builtinProfileIdForChoice(shelves.primary) === activeId}
            role="option"
            aria-selected={builtinProfileIdForChoice(shelves.primary) === activeId}
            onclick={() => selectBuiltin(shelves.primary!)}
          >
            {hostLayoutChoiceLabel(shelves.primary)}
          </button>
          {#if canStore}
          <button
            type="button"
            class="profile-icon"
            title="Скопировать профиль"
            aria-label="Скопировать {hostLayoutChoiceLabel(shelves.primary)}"
            onclick={event => copyLayout(shelves.primary!, event)}
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
            class:selected={builtinProfileIdForChoice(choice) === activeId}
            role="option"
            aria-selected={builtinProfileIdForChoice(choice) === activeId}
            onclick={() => selectBuiltin(choice)}
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
</style>
