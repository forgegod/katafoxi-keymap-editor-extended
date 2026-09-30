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
  import LangFlag from './LangFlag.svelte'

  const REMOVE_LANGUAGE = '__remove__'

  interface Props {
    column?: HostLegendColumn
    interactive: boolean
    /** First column of a language after the base — stronger left edge between languages. */
    groupStart?: boolean
    /** Multilang face shows every column; the eye waits until that face is off. */
    languagesStacked?: boolean
    pickingFor?: HostLanguageId | null
    pickingNew?: boolean
    openProfile?: HostLanguageId | null
  }

  let {
    column,
    interactive,
    groupStart = false,
    languagesStacked = false,
    pickingFor = $bindable(null),
    pickingNew = $bindable(false),
    openProfile = $bindable(null)
  }: Props = $props()

  const choice = $derived(column ? hostLayoutChoice(column.layoutId) : undefined)
  const language = $derived(column?.language)
  const extra = $derived(language != null && isAddableHostLanguage(language))
  const needsHostLanguage = $derived(editor.hostLegend.columns.length < 2)
  const languageName = $derived(choice?.languageName ?? language ?? '')
  const choosing = $derived(language != null && pickingFor === language)
  const addable = $derived(hostLanguagesAvailable(editor.hostLegend))

  function activeProfileLabel(): string {
    if (!language) return ''
    const id = editor.activeProfileId(language)
    const user = editor.profilesForLanguage(language).find(profile => profile.id === id)
    const full = user
      ? user.name
      : (() => {
          const selected = hostLayoutChoice(id)
          return selected ? hostLayoutChoiceLabel(selected) : ''
        })()
    const paren = full.match(/\(([^)]+)\)\s*$/)
    return paren ? paren[1] : full
  }

  function toggleLanguage() {
    if (!language || languagesStacked) return
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
  <th class="add-language-cell lang-start" class:prompt={needsHostLanguage}>
    {#if pickingNew}
      <div class="lang-head">
        <select
          use:focusSelect
          class="language-select"
          aria-label="Language"
          value=""
          onchange={event => pickNewLanguage(event.currentTarget.value)}
        >
          <option value="" disabled>Language</option>
          {#each addable as option (option)}
            <option value={option}>{hostLanguageName(option)}</option>
          {/each}
        </select>
      </div>
    {:else if needsHostLanguage}
      <div class="lang-head host-prompt">
        <span class="prompt-label">Computer language</span>
        <select
          class="language-select"
          aria-label="Computer language"
          value=""
          onchange={event => pickNewLanguage(event.currentTarget.value)}
        >
          <option value="" disabled>Choose</option>
          {#each addable as option (option)}
            <option value={option}>{hostLanguageName(option)}</option>
          {/each}
        </select>
      </div>
    {:else}
      <button
        type="button"
        class="add-language"
        aria-label="Add language"
        title="Add language"
        onclick={startAddLanguage}
      >
        +
      </button>
    {/if}
  </th>
{:else}
  <th class:off={!column.shown} class:narrow={!column.wide} class:lang-start={groupStart}>
    <div class="lang-head" class:narrow={!column.wide && !choosing}>
      {#if interactive}
        <EyeToggle
          on={languagesStacked || column.shown}
          disabled={languagesStacked}
          label={
            languagesStacked
              ? `${choice?.languageName ?? language} stays on the key while languages are stacked`
              : column.shown
                ? `Hide ${choice?.languageName ?? language}`
                : `Show ${choice?.languageName ?? language}`
          }
          onclick={toggleLanguage}
        />
        {#if extra}
          <button
            type="button"
            class="lang-flag"
            title={choice?.languageName ?? language}
            aria-label={`Language ${choice?.languageName ?? language}`}
            aria-expanded={choosing}
            onclick={toggleLanguagePicker}
          >
            {#if language}<LangFlag {language} />{/if}
            <span class="caret" aria-hidden="true"></span>
          </button>
        {:else}
          <span class="lang-flag" title={extra ? languageName : 'Firmware key codes (US)'}>
            {#if language}<LangFlag {language} alt={extra ? languageName : 'English, firmware key codes'} />{/if}
          </span>
        {/if}
        <div class="lang-tools" hidden={!column.wide && !choosing}>
          {#if choosing}
            <select
              use:focusSelect
              class="language-select"
              aria-label="Language"
              value=""
              onchange={event => changeLanguage(event.currentTarget.value)}
            >
              <option value="" disabled hidden></option>
              <option value={REMOVE_LANGUAGE}>Remove language</option>
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
        <span class="lang-flag" title={extra ? languageName : 'Firmware key codes (US)'}>
          {#if language}<LangFlag {language} alt={extra ? languageName : 'English, firmware key codes'} />{/if}
        </span>
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
    color: var(--text-subtle);
  }

  .off {
    opacity: 0.4;
  }

  th.narrow {
    min-width: 0;
    width: 1%;
  }

  th.lang-start {
    border-left: 2px solid rgba(60, 60, 60, 0.28);
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
    border: 1px dashed var(--accent);
    border-radius: 4px;
    background: var(--surface);
    color: var(--accent);
    font: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }

  .add-language:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .host-prompt {
    gap: 6px;
  }

  .prompt-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.2;
    color: var(--accent);
  }

  .lang-flag {
    display: inline-flex;
    align-items: center;
    line-height: 0;
  }

  button.lang-flag {
    gap: 3px;
    margin: 0;
    padding: 2px 4px 2px 3px;
    border: 1px solid var(--paper-border);
    border-radius: 4px;
    background: var(--surface);
    color: var(--paper-ink);
    cursor: pointer;
  }

  button.lang-flag:hover,
  button.lang-flag[aria-expanded='true'] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--accent);
  }

  button.lang-flag:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  button.lang-flag .caret {
    width: 0;
    height: 0;
    border-left: 3px solid transparent;
    border-right: 3px solid transparent;
    border-top: 4px solid currentColor;
  }

  button.lang-flag[aria-expanded='true'] .caret {
    transform: rotate(180deg);
  }

  .profile-name {
    font-size: 12px;
    color: var(--text-subtle);
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
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-sunken);
    color: var(--text-faint);
    font: inherit;
    font-family: var(--glyph-font, Inter, "Noto Sans", sans-serif);
    font-size: 12px;
    cursor: pointer;
  }

  .col-toggle.on {
    background: var(--surface);
    border-color: var(--accent);
    color: var(--text);
  }
</style>
