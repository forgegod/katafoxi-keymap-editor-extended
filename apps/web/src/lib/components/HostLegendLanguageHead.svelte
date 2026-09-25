<script lang="ts">
  import {
    ALT_GR_COLUMN_LABEL,
    ALT_GR_SHIFT_COLUMN_LABEL,
    addHostLanguage,
    hostLanguageName,
    hostLanguagesAvailable,
    hostLayoutChoice,
    hostLayoutChoiceLabel,
    isAddableHostLanguage,
    removeHostLanguage,
    replaceHostLanguage,
    setHostColumnAlt,
    toggleHostLanguage,
    type HostLanguageId,
    type HostLegendColumn
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import EyeToggle from './EyeToggle.svelte'
  import HostProfileMenu from './HostProfileMenu.svelte'

  const REMOVE_LANGUAGE = '__remove__'

  interface Props {
    column?: HostLegendColumn
    interactive: boolean
    pickingFor?: HostLanguageId | null
    pickingNew?: boolean
    openProfile?: HostLanguageId | null
  }

  let {
    column,
    interactive,
    pickingFor = $bindable(null),
    pickingNew = $bindable(false),
    openProfile = $bindable(null)
  }: Props = $props()

  const choice = $derived(column ? hostLayoutChoice(column.layoutId) : undefined)
  const language = $derived(column?.language)
  const extra = $derived(language != null && isAddableHostLanguage(language))
  const choosing = $derived(language != null && pickingFor === language)
  const addable = $derived(hostLanguagesAvailable(editor.hostLegend))

  function activeProfileLabel(): string {
    if (!language) return ''
    const id = editor.activeProfileId(language)
    const user = editor.profilesForLanguage(language).find(profile => profile.id === id)
    if (user) return user.name
    const selected = hostLayoutChoice(id)
    return selected ? hostLayoutChoiceLabel(selected) : ''
  }

  function toggleLanguage() {
    if (!language) return
    void editor.commitHostMap(toggleHostLanguage(editor.hostLegend, language))
  }

  function languageChoices(): HostLanguageId[] {
    return hostLanguagesAvailable(editor.hostLegend)
  }

  function startAddLanguage() {
    if (addable.length === 0) return
    pickingNew = true
    pickingFor = null
    openProfile = null
  }

  function pickNewLanguage(value: string) {
    if (!isAddableHostLanguage(value)) return
    pickingNew = false
    pickingFor = null
    void editor.commitHostMap(addHostLanguage(editor.hostLegend, value))
  }

  function toggleLanguagePicker() {
    if (!column || !language || !extra) return
    if (!column.wide) void editor.commitHostMap(toggleHostLanguage(editor.hostLegend, language))
    pickingNew = false
    pickingFor = pickingFor === language ? null : language
    openProfile = null
  }

  function changeLanguage(value: string) {
    if (!language) return
    if (value === REMOVE_LANGUAGE) {
      pickingNew = false
      pickingFor = null
      void editor.commitHostMap(removeHostLanguage(editor.hostLegend, language))
      return
    }
    if (!isAddableHostLanguage(value) || value === language) {
      pickingFor = null
      return
    }
    pickingNew = false
    pickingFor = null
    void editor.commitHostMap(replaceHostLanguage(editor.hostLegend, language, value))
  }

  function toggleAlt(field: 'altGr' | 'altGrShift', on: boolean) {
    if (!language) return
    void editor.commitHostMap(setHostColumnAlt(editor.hostLegend, language, field, !on))
  }

  function hoverAlt(kind: 'altGr' | 'altGrShift') {
    editor.legendHover = { kind }
  }

  function clearHover() {
    editor.legendHover = null
  }

  function focusSelect(node: HTMLSelectElement) {
    node.focus()
  }
</script>

{#if !column}
  <th class="add-language-cell">
    {#if pickingNew}
      <div class="lang-head">
        <select
          use:focusSelect
          class="language-select"
          aria-label="Язык"
          value=""
          onchange={event => pickNewLanguage(event.currentTarget.value)}
        >
          <option value="" disabled>Язык</option>
          {#each addable as option (option)}
            <option value={option}>{hostLanguageName(option)}</option>
          {/each}
        </select>
      </div>
    {:else}
      <button
        type="button"
        class="add-language"
        aria-label="Добавить язык"
        title="Добавить язык"
        onclick={startAddLanguage}
      >
        +
      </button>
    {/if}
  </th>
{:else}
  <th class:off={!column.shown} class:narrow={!column.wide}>
    <div class="lang-head" class:narrow={!column.wide && !choosing}>
      {#if interactive}
        <EyeToggle
          on={column.shown}
          label={column.shown ? `Скрыть ${choice?.languageName ?? language}` : `Показать ${choice?.languageName ?? language}`}
          onclick={toggleLanguage}
        />
        {#if extra}
          <button
            type="button"
            class="lang-flag"
            title={choice?.languageName ?? language}
            aria-label={`Язык ${choice?.languageName ?? language}`}
            aria-expanded={choosing}
            onclick={toggleLanguagePicker}
          >
            {choice?.flag ?? '—'}
          </button>
        {:else}
          <span class="lang-flag" title={choice?.languageName ?? language}>{choice?.flag ?? '—'}</span>
        {/if}
        <div class="lang-tools" hidden={!column.wide && !choosing}>
          {#if choosing}
            <select
              use:focusSelect
              class="language-select"
              aria-label="Язык"
              value=""
              onchange={event => changeLanguage(event.currentTarget.value)}
            >
              <option value="" disabled hidden></option>
              <option value={REMOVE_LANGUAGE}>Убрать язык</option>
              {#each languageChoices() as option (option)}
                <option value={option}>{hostLanguageName(option)}</option>
              {/each}
            </select>
          {/if}
          {#if column.wide}
            <HostProfileMenu
              language={column.language}
              languageName={choice?.languageName ?? column.language}
              open={openProfile === column.language}
              onToggle={() => {
                openProfile = openProfile === column.language ? null : column.language
              }}
              onClose={() => {
                if (openProfile === column.language) openProfile = null
              }}
            />
          {/if}
        </div>
      {:else}
        <span class="eye-spacer"></span>
        <span class="lang-flag">{choice?.flag ?? '—'}</span>
        {#if column.wide}
          <span class="profile-name">{activeProfileLabel()}</span>
        {/if}
      {/if}
    </div>
  </th>
  {#if column.wide}
    <th
      class:off={!column.altGr}
      onmouseenter={interactive ? () => hoverAlt('altGr') : undefined}
      onmouseleave={interactive ? clearHover : undefined}
    >
      {#if interactive}
        <button
          type="button"
          class="col-toggle"
          class:on={column.altGr}
          aria-label="AltGr"
          title="AltGr"
          onclick={() => toggleAlt('altGr', column.altGr)}
        >
          {ALT_GR_COLUMN_LABEL}
        </button>
      {:else}
        {ALT_GR_COLUMN_LABEL}
      {/if}
    </th>
    <th
      class:off={!column.altGrShift}
      onmouseenter={interactive ? () => hoverAlt('altGrShift') : undefined}
      onmouseleave={interactive ? clearHover : undefined}
    >
      {#if interactive}
        <button
          type="button"
          class="col-toggle"
          class:on={column.altGrShift}
          aria-label="AltGr+Shift"
          title="AltGr+Shift"
          onclick={() => toggleAlt('altGrShift', column.altGrShift)}
        >
          {ALT_GR_SHIFT_COLUMN_LABEL}
        </button>
      {:else}
        {ALT_GR_SHIFT_COLUMN_LABEL}
      {/if}
    </th>
  {/if}
{/if}

<style>
  th {
    padding: 2px 5px;
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid rgba(60, 60, 60, 0.08);
    font-size: 12px;
    color: #666;
  }

  .off {
    opacity: 0.4;
  }

  th.narrow {
    min-width: 0;
    width: 1%;
  }

  .lang-head {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .lang-head.narrow {
    min-width: 0;
    width: 1%;
  }

  .lang-tools {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .lang-tools[hidden] {
    display: none;
  }

  .language-select {
    max-width: 7.5rem;
    min-height: 24px;
    padding: 1px 4px;
    font: inherit;
    font-size: 12px;
  }

  .add-language-cell {
    width: 1%;
  }

  .add-language {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px dashed #1d6f8a;
    border-radius: 4px;
    background: #fff;
    color: #1d6f8a;
    font: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }

  .add-language:hover {
    background: rgba(29, 111, 138, 0.08);
  }

  .lang-flag {
    font-size: 16px;
    line-height: 1.2;
  }

  button.lang-flag {
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 16px;
    line-height: 1.2;
    cursor: pointer;
  }

  .profile-name {
    font-size: 12px;
    color: #666;
  }

  .eye-spacer {
    display: inline-block;
    width: 16px;
    height: 16px;
    padding: 1px;
  }

  .col-toggle {
    margin: 0;
    padding: 1px 6px;
    border: 1px solid #ccc;
    border-radius: 10px;
    background: #f3f3f3;
    color: #777;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .col-toggle.on {
    background: #fff;
    border-color: #1d6f8a;
    color: #333;
  }
</style>
