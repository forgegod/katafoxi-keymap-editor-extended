<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import {
    UNICODE_ALIASES, UNICODE_MODES, UNICODE_DOCS_URL,
    unicodeAliasBinding, unicodeBinding, unicodeBindingState,
    unicodeCodePoint, unicodeCodePointLabel, unicodeGlyph, unicodeModeBinding,
    type KeyBindingNode, type UnicodeHostLayoutCompatibility
  } from '@keymap-editor/keymap-core'

  let { value, compatibility, onChange }: {
    value: KeyBindingNode
    compatibility?: UnicodeHostLayoutCompatibility
    onChange: (binding: KeyBindingNode | null) => void
  } = $props()
  const original = untrack(() => value)
  const initial = unicodeBindingState(original)
  let kind = $state<'character' | 'mode'>(initial?.kind === 'mode' ? 'mode' : 'character')
  let normal = $state(initial?.kind === 'codepoints' ? unicodeCodePointLabel(initial.normal) : '')
  let shift = $state(initial?.kind === 'codepoints' && initial.shift !== 0 ? unicodeCodePointLabel(initial.shift) : '0')
  let mode = $state(initial?.kind === 'mode' ? initial.mode : 'UC_SET_WIN_COMPOSE')
  let query = $state('')
  let group = $state('')
  let error = $state('')
  let opaque = $state(initial == null && original.params.length > 0)
  const normalCp = $derived(unicodeCodePoint(normal))
  const shiftCp = $derived(unicodeCodePoint(shift))
  const groups = [...new Set(UNICODE_ALIASES.map(row => row.group))]
  const matches = $derived(UNICODE_ALIASES.filter(row => {
    const text = `${row.code} ${row.group} ${unicodeGlyph(row.normal)} ${unicodeGlyph(row.shift || row.normal)}`
    return (!group || row.group === group) && text.toLowerCase().includes(query.trim().toLowerCase())
  }))
  const modeInfo = $derived(UNICODE_MODES.find(row => row.code === mode))

  onMount(() => onChange(initial || opaque ? original : null))

  function characterChanged() {
    opaque = false
    try {
      const binding = unicodeBinding(normal, shift)
      error = ''
      onChange(binding)
    } catch (e) {
      error = (e as Error).message
      onChange(null)
    }
  }
  function chooseAlias(code: string) {
    const binding = unicodeAliasBinding(code)
    const pair = unicodeBindingState(binding)
    if (pair?.kind !== 'codepoints') return
    normal = unicodeCodePointLabel(pair.normal)
    shift = pair.shift === 0 ? '0' : unicodeCodePointLabel(pair.shift)
    opaque = false
    error = ''
    onChange(binding)
  }
  function modeChanged() {
    opaque = false
    error = ''
    onChange(unicodeModeBinding(mode))
  }
  function chooseKind(next: 'character' | 'mode') {
    kind = next
    if (kind === 'mode') modeChanged()
    else characterChanged()
  }
</script>

<section class="unicode-picker" aria-label="Unicode picker">
  <div class="unicode-tabs" role="group" aria-label="Unicode binding type">
    <button type="button" aria-pressed={kind === 'character'} data-unicode-kind="character" onclick={() => chooseKind('character')}>Character</button>
    <button type="button" aria-pressed={kind === 'mode'} data-unicode-kind="mode" onclick={() => chooseKind('mode')}>Input mode switch</button>
  </div>
  <div class="unicode-compatibility" class:unicode-warning={compatibility?.status !== 'compatible'} role="status" aria-label="Unicode host-layout compatibility" aria-atomic="true">
    {#if compatibility?.status === 'compatible'}
      <strong>Compatible English layout</strong>
      <p>The editor-selected English profile preserves the required unshifted service keys.</p>
    {:else if compatibility?.status === 'incompatible'}
      <strong>Incompatible English layout</strong>
      <p>The editor-selected English profile has missing or remapped service keys.</p>
      <ul>
        {#each compatibility.issues as issue}
          <li><code>{issue.zmk}</code>: {issue.reason}; expected <code>{issue.expectedKeysym}</code>; found <code>{issue.actualKeysym || 'no mapping'}</code>.</li>
        {/each}
      </ul>
      <p>Warning only: Unicode editing and Apply remain available. No host mappings or firmware bindings are repaired.</p>
    {:else}
      <strong>English layout unavailable</strong>
      <p>The editor-selected English profile has no available table to check.</p>
      <p>Warning only: Unicode editing and Apply remain available. No fallback to another layout.</p>
    {/if}
  </div>
  <p class="unicode-note">&amp;uc requires a compatible English layout to be active in the OS while used. A national layout may remain installed. The editor cannot detect, select, or modify the OS active layout.</p>
  <p class="unicode-note">Requires urob/zmk-unicode in west.yml and host input setup. Save adds the module header; it does not install the module or configure your OS. <a href={UNICODE_DOCS_URL} target="_blank" rel="noopener noreferrer">Setup instructions</a></p>
  {#if opaque}
    <p class="unicode-note">This external expression is kept unchanged. Enter code points or pick an alias to replace it.</p>
  {/if}
  {#if kind === 'character'}
    <div class="unicode-fields">
      <label>Normal
        <input aria-label="Normal Unicode character or code point" placeholder="ä, U+00E4, or 0xE4" value={normal} oninput={event => { normal = event.currentTarget.value; characterChanged() }} />
      </label>
      <label>With Shift
        <input aria-label="Shift Unicode character or code point" placeholder="Ä, U+00C4, or 0" value={shift} oninput={event => { shift = event.currentTarget.value; characterChanged() }} />
      </label>
    </div>
    <p class="unicode-note">Enter one Unicode scalar, U+hex, 0xhex, or a decimal code point. Shift 0 reuses Normal; no uppercase conversion is guessed.</p>
    {#if normalCp != null && shiftCp != null}
      <output aria-label="Unicode character preview">Normal: {unicodeGlyph(normalCp)} · Shift: {unicodeGlyph(shiftCp || normalCp)}</output>
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
    <div class="unicode-fields">
      <label>Common aliases
        <input type="search" aria-label="Filter Unicode aliases" placeholder="Search alias or character…" bind:value={query} />
      </label>
      <label>Group
        <select aria-label="Unicode alias group" bind:value={group}>
          <option value="">All aliases</option>
          {#each groups as name}<option value={name}>{name}</option>{/each}
        </select>
      </label>
    </div>
    <div class="unicode-aliases">
      {#each matches as alias (alias.code)}
        <button type="button" data-unicode-alias={alias.code} title={`${alias.group}: ${unicodeCodePointLabel(alias.normal)} / ${unicodeCodePointLabel(alias.shift || alias.normal)}`} onclick={() => chooseAlias(alias.code)}>
          <span>{unicodeGlyph(alias.normal)} · {unicodeGlyph(alias.shift || alias.normal)}</span><code>{alias.code}</code>
        </button>
      {:else}<p>No matching aliases. Any scalar can be entered above.</p>{/each}
    </div>
  {:else}
    <label>Switch the keyboard's Unicode input system
      <select aria-label="Unicode input mode" value={mode} onchange={event => { mode = event.currentTarget.value; modeChanged() }}>
        {#each UNICODE_MODES as item}<option value={item.code}>{item.name}</option>{/each}
      </select>
    </label>
    <p class="unicode-note">{modeInfo?.setup} This binding switches the mode at runtime; it does not change default-mode or OS settings.</p>
  {/if}
</section>

<style>
  .unicode-picker {
    display: grid;
    flex: none;
    min-width: 0;
    gap: 6px;
    color: var(--text);
    font-size: var(--font-sm);
    line-height: 1.35;
  }
  .unicode-compatibility { display: grid; gap: 6px; min-width: 0; padding: 7px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-sunken); color: var(--text); font-size: var(--font-sm); overflow-wrap: anywhere; }
  .unicode-compatibility p, .unicode-compatibility ul { margin: 0; }
  .unicode-compatibility ul { padding-left: 1.4em; }
  .unicode-warning { color: var(--warn-ink); background: var(--warn-wash); border-color: var(--warn-border); }
  .unicode-tabs, .unicode-fields { display: flex; gap: 6px; flex-wrap: wrap; }
  .unicode-tabs { gap: 4px; }
  .unicode-picker label { display: grid; gap: 3px; flex: 1 1 10rem; min-width: 0; color: var(--text-muted); }

  /* Opt in locally; override the app's ordinary 30px select chrome. */
  .unicode-picker input,
  :global(#app-root) .unicode-picker select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 24px;
    min-height: 24px;
    padding: 0 6px;
    font: inherit;
    color: var(--text);
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .unicode-tabs button, .unicode-aliases button {
    box-sizing: border-box;
    min-width: 0;
    min-height: 22px;
    padding: 2px 7px;
    font: inherit;
    line-height: 1.2;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .unicode-tabs button[aria-pressed="true"] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
  .unicode-tabs button:hover, .unicode-aliases button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .unicode-picker input:focus-visible,
  :global(#app-root) .unicode-picker select:focus,
  .unicode-tabs button:focus-visible, .unicode-aliases button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .unicode-note { color: var(--text-muted); margin: 0; overflow-wrap: anywhere; }
  /* KeyEditor main owns vertical scrolling, including the unfiltered catalog. */
  .unicode-aliases { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr)); gap: 4px; }
  .unicode-aliases button { display: grid; gap: 1px; padding: 2px 6px; text-align: left; }
  .unicode-aliases code { font-size: var(--font-xs); line-height: 1.2; overflow-wrap: anywhere; }
  .unicode-aliases p { margin: 0; color: var(--text-muted); }
  [role="alert"] { color: var(--danger-ink); margin: 0; overflow-wrap: anywhere; }
</style>
