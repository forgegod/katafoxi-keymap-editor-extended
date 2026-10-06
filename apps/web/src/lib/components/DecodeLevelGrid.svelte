<script lang="ts">
  import {
    ALT_GR_COLUMN_LABEL,
    ALT_GR_SHIFT_COLUMN_LABEL,
    ALT_LEVEL_EMPTY,
    hostLanguageName,
    type HostLanguageId,
    type LegendDecodeColumn
  } from '@keymap-editor/keymap-core'
  import LangFlag from './LangFlag.svelte'

  interface Props {
    current: LegendDecodeColumn[]
    system: LegendDecodeColumn[] | null
    hostSession?: boolean
    showRevertRow?: boolean
    dropsWarning?: boolean
    editing?: { language: HostLanguageId; level: number } | null
    zmk?: string
    busy?: boolean
  }

  let {
    current,
    system,
    hostSession = false,
    showRevertRow = false,
    dropsWarning = false,
    editing = null,
    zmk = '',
    busy = false
  }: Props = $props()

  const LEVEL_LABELS = ['tap', '⇧', ALT_GR_COLUMN_LABEL, ALT_GR_SHIFT_COLUMN_LABEL] as const

  function levelTitle(language: HostLanguageId, index: number): string {
    const name = hostLanguageName(language)
    const level = LEVEL_LABELS[index] ?? `level ${index}`
    return `${name} ${level}`
  }
</script>

<div
  class="decode-table"
  style="--lang-count: {current.length}"
  role="table"
  aria-label="Host levels"
>
  <div class="row flags" role="row">
    {#each current as column (column.language)}
      <div
        class="lang-head flag"
        role="columnheader"
        aria-colspan="4"
        data-language={column.language}
        title={hostLanguageName(column.language)}
      >
        <LangFlag language={column.language} alt={hostLanguageName(column.language)} />
      </div>
    {/each}
  </div>
  <div class="row levels" role="row">
    {#each current as column (column.language)}
      <div class="lang" data-language={column.language} role="none">
        {#each LEVEL_LABELS as label, index (`${column.language}-lvl-${index}`)}
          <span class="level-label" role="columnheader">{label}</span>
        {/each}
      </div>
    {/each}
  </div>
  {#if system}
    <div class="row system" role="row">
      {#each system as column (column.language)}
        <div class="lang" data-language={column.language} role="none">
          {#each column.slots as slot, index (`${column.language}-sys-${index}`)}
            <span
              class="slot"
              class:empty={slot.text === ALT_LEVEL_EMPTY && !slot.dead}
              class:dead={slot.dead}
              role="cell"
              >{slot.text}</span
            >
          {/each}
        </div>
      {/each}
    </div>
  {/if}
  <div class="row current" role="row">
    {#each current as column (column.language)}
      <div class="lang" data-language={column.language} role="none">
        {#each column.slots as slot, index (`${column.language}-${index}`)}
          {@const isEditing =
            hostSession &&
            editing?.language === column.language &&
            editing.level === index}
          <div class="cell" class:editing={isEditing} role="cell">
            {#if hostSession}
              <button
                type="button"
                class="slot"
                class:empty={slot.text === ALT_LEVEL_EMPTY && !slot.dead}
                class:dead={slot.dead}
                class:diff={slot.differs}
                data-host-edit
                data-language={column.language}
                data-level={index}
                data-text={slot.text}
                data-dead={slot.dead ? '1' : undefined}
                disabled={!zmk}
                aria-label={slot.dead
                  ? `Edit ${levelTitle(column.language, index)} dead key ${slot.text}`
                  : `Edit ${levelTitle(column.language, index)}`}
                aria-expanded={isEditing}
                aria-haspopup="dialog"
              >
                {slot.text}
              </button>
            {:else}
              <span
                class="slot"
                class:empty={slot.text === ALT_LEVEL_EMPTY && !slot.dead}
                class:dead={slot.dead}
                class:diff={slot.differs}
                >{slot.text}</span
              >
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  {#if showRevertRow}
    <div class="row revert-row" role="row">
      {#each current as column (column.language)}
        <div class="lang" data-language={column.language} role="none">
          {#each column.slots as slot, index (`${column.language}-rev-${index}`)}
            <div class="cell revert-cell" role="cell">
              {#if slot.differs}
                <button
                  type="button"
                  class="revert"
                  data-host-revert
                  data-language={column.language}
                  data-level={index}
                  title="Revert to system"
                  aria-label={`Revert ${levelTitle(column.language, index)}`}
                  disabled={busy || !zmk}
                >
                  ↺
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
  {#if dropsWarning}
    <p class="warn" role="status">
      Base level is non-character — this key drops out of composition
    </p>
  {/if}
</div>

<style>
  .decode-table {
    display: grid;
    grid-template-columns: repeat(var(--lang-count, 1), max-content);
    column-gap: 12px;
    row-gap: 2px;
    width: max-content;
    justify-self: start;
  }

  .row {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
  }

  .lang-head {
    display: flex;
    justify-content: center;
    line-height: 0;
  }

  .lang {
    display: grid;
    grid-template-columns: repeat(4, minmax(1.35em, max-content));
    column-gap: 2px;
    align-items: center;
    justify-items: center;
  }

  .level-label {
    font-family: Quicksand, avenir, sans-serif;
    font-size: var(--font-sm);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--paper-ink-faint);
    line-height: 1;
  }

  .row.system {
    opacity: 0.45;
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35em;
    min-height: 1.35em;
  }

  .cell.editing .slot {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }

  .revert-cell {
    min-height: 1.1em;
  }

  button.slot,
  span.slot {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35em;
    min-height: 1.35em;
    margin: 0;
    padding: 1px 3px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-family: var(--glyph-font, Inter, "Noto Sans", sans-serif);
  }

  button.slot {
    cursor: pointer;
  }

  button.slot:disabled {
    cursor: default;
  }

  .slot.empty {
    color: var(--text-disabled);
  }

  .slot.dead {
    color: var(--warn-ink);
    background: var(--warn-wash);
    box-shadow: inset 0 0 0 1px var(--warn-border);
  }

  .slot.diff {
    color: var(--warn-ink);
    background: var(--highlight);
    border-radius: 3px;
  }

  .slot.dead.diff {
    background: color-mix(in srgb, var(--warn-wash) 55%, var(--highlight));
  }

  .lang[data-language='ru'] .slot.diff,
  .lang[data-language='uk'] .slot.diff,
  .lang[data-language='de'] .slot.diff,
  .lang[data-language='fr'] .slot.diff,
  .lang[data-language='pl'] .slot.diff,
  .lang[data-language='es'] .slot.diff {
    color: var(--accent-strong);
  }

  .warn {
    margin: 4px 0 0;
    grid-column: 1 / -1;
    width: 0;
    min-width: 100%;
    white-space: normal;
    font-size: var(--font-sm);
    line-height: 1.25;
    font-family: Quicksand, avenir, sans-serif;
    color: var(--warn);
  }

  .revert {
    margin: 0;
    padding: 0 2px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--paper-ink-subtle);
    font: inherit;
    font-family: var(--glyph-font, Inter, "Noto Sans", sans-serif);
    font-size: var(--font-icon);
    line-height: 1;
    cursor: pointer;
  }

  .revert:hover:not(:disabled) {
    background: color-mix(in srgb, var(--paper-shade) 8%, transparent);
    color: var(--text);
  }
</style>
