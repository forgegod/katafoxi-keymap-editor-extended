<script lang="ts">
  import {
    comboChordOverlapPartners,
    comboDesignHint,
    comboKeysIssue,
    comboListMeta,
    comboOverlapMessage,
    encodeKeyBinding,
    type KeyBindingNode,
    type ZmkCombo
  } from '@keymap-editor/keymap-core'
  import './Combo.css'

  interface Props {
    combos: readonly ZmkCombo[]
    activeComboId: string | null
    layer0: KeyBindingNode[] | undefined
    onSelect: (id: string) => void
  }

  let { combos, activeComboId, layer0, onSelect }: Props = $props()

  const overlapPartners = $derived(comboChordOverlapPartners([...combos]))

  function bindingLabel(combo: ZmkCombo): string {
    try {
      return encodeKeyBinding(combo.binding)
    } catch {
      return String(combo.binding.value)
    }
  }
</script>

{#if combos.length === 0}
  <p class="combo-empty">No combos yet.</p>
{:else}
  <ul class="combo-list" aria-label="Combo list">
    {#each combos as combo (combo.id)}
      {@const issue = comboKeysIssue(combo.keyPositions)}
      {@const partner = overlapPartners.get(combo.id) ?? null}
      {@const soft =
        issue == null &&
        partner == null &&
        comboDesignHint(combo.keyPositions, layer0, combo.binding)}
      <li>
        <button
          type="button"
          class="combo-item"
          class:active={combo.id === activeComboId}
          class:invalid={issue != null || partner != null}
          class:soft-warn={!!soft}
          title={comboOverlapMessage(partner) ?? undefined}
          aria-current={combo.id === activeComboId ? 'true' : undefined}
          onclick={() => onSelect(combo.id)}
        >
          <span class="combo-main">
            <span class="combo-id">{combo.id}</span>
            <span class="combo-bind">{bindingLabel(combo)}</span>
          </span>
          <span class="combo-meta">{comboListMeta(combo)}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .combo-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
  }

  .combo-item {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: start;
    margin: 0;
    padding: 5px 7px;
    text-align: left;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .combo-item:hover {
    background: color-mix(in srgb, var(--hover-selection) 35%, transparent);
  }

  .combo-item.active {
    border-color: var(--accent, #3a7);
    background: color-mix(in srgb, var(--accent, #3a7) 14%, transparent);
  }

  .combo-item.invalid .combo-meta {
    color: var(--danger, #b33);
  }

  .combo-item.soft-warn .combo-meta {
    color: var(--warning, #b8860b);
  }

  .combo-main {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .combo-id {
    font-weight: 600;
  }

  .combo-bind {
    color: var(--text-muted);
    font-size: 0.9em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .combo-meta {
    color: var(--text-muted);
    font-size: 0.82em;
    line-height: 1.25;
    text-align: right;
    max-width: 6.5rem;
  }
</style>
