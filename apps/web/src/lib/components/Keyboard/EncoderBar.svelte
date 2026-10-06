<script lang="ts">
  import { flushSync } from 'svelte'
  import {
    encodeKeyBinding,
    getBehaviorCatalog,
    getKeycodeCatalog,
    keycapLegend,
    mergeHoldTapCatalog,
    type KeyBindingNode
  } from '@keymap-editor/keymap-core'
  import { getDefinitionsContext, getSearchContext } from '../../context'
  import { editor } from '../../editor.svelte.js'
  import { createKeyEditSession } from '../../key-edit-session.svelte'
  import KeyEditorHost from '../KeyEditorHost.svelte'

  const definitionsBox = getDefinitionsContext()
  const searchBox = getSearchContext()

  const rows = $derived(editor.draftKeymap?.sensorBindings ?? [])
  const visible = $derived(rows.some(row => row.length > 0))
  let editing = $state<{ layer: number; index: number } | null>(null)

  /** Same preview as a legend-row hover. At rest the strip shows the base layer. */
  const layerIndex = $derived.by(() => {
    const hover = editor.legendHover
    const index =
      hover?.kind === 'layer'
        ? hover.layer
        : hover?.kind === 'layers' && hover.source != null
          ? hover.source
          : 0
    return index >= 0 && index < rows.length ? index : 0
  })
  const turns = $derived(rows[layerIndex] ?? [])
  const activeBinding = $derived(
    editing ? rows[editing.layer]?.[editing.index] ?? null : null
  )

  const sources = $derived.by(() => {
    const defs = definitionsBox?.current
    const searchSources = searchBox?.current?.sources ?? {}
    const holdTaps = editor.draftKeymap?.holdTaps ?? editor.baselineKeymap?.holdTaps
    const catalog = defs
      ? mergeHoldTapCatalog(defs.behaviours, holdTaps).byCode
      : getBehaviorCatalog().byCode
    const behaviours: Record<string, unknown> = { ...catalog }
    const binding = activeBinding
    if (binding) {
      const code = String(binding.value)
      if (!behaviours[code]) {
        behaviours[code] = {
          code,
          name: 'Encoder',
          params: binding.params.map(() => 'code')
        }
      }
    }
    return {
      ...searchSources,
      code: (searchSources.code ??
        defs?.keycodes.byCode ??
        getKeycodeCatalog().byCode) as Record<string, unknown>,
      behaviours
    }
  })

  const session = createKeyEditSession({
    sources: () => sources as Record<string, Record<string, unknown>>,
    search: () => searchBox?.current,
    bindings: () =>
      activeBinding ? [activeBinding] : [{ value: '&none', params: [] }],
    layerIndex: () => 0,
    keyIndex: () => -1,
    onUpdate: (_keyIndex, _layerIndex, binding) => {
      if (!editing) return
      editor.updateSensorBinding(editing.layer, editing.index, binding)
    }
  })

  function glyph(code: string | number | undefined): string {
    if (code == null || code === '') return '—'
    const row = getKeycodeCatalog().byCode[String(code)]
    return keycapLegend(code, row?.symbol)
  }

  function turnTitle(binding: KeyBindingNode): string {
    try {
      return encodeKeyBinding(binding)
    } catch {
      return String(binding.value)
    }
  }

  function openTurn(index: number, slot: number) {
    const binding = turns[index]
    if (!binding || binding.params.length === 0) return
    editing = { layer: layerIndex, index }
    flushSync()
    session.openEditor(slot, 0)
  }

  function closeEditor() {
    session.closeEditor()
    editing = null
  }
</script>

{#if visible}
  <div class="encoder-bar" aria-label="Encoders">
    {#if turns.length === 0}
      <p class="encoder-empty">No encoder on this layer.</p>
    {:else}
      <div class="encoder-row">
        <!-- Index key: sensor-binding slots are positional; no stable encoder id in the keymap. -->
        {#each turns as binding, index (index)}
          {@const cw = binding.params[0]}
          {@const ccw = binding.params[1]}
          <div
            class="encoder"
            data-encoder={index}
            title={turnTitle(binding)}
            aria-label={turns.length === 1 ? 'Encoder' : `Encoder ${index + 1}`}
          >
            {#if cw}
              <button
                type="button"
                class="encoder-turn"
                data-encoder-turn="cw"
                aria-label={`Clockwise ${glyph(cw.value)}`}
                onclick={() => openTurn(index, 1)}
              >
                <span class="encoder-dir" aria-hidden="true">↻</span>
                <span class="encoder-glyph">{glyph(cw.value)}</span>
              </button>
            {/if}
            <span class="encoder-knob" aria-hidden="true"></span>
            {#if ccw}
              <button
                type="button"
                class="encoder-turn"
                data-encoder-turn="ccw"
                aria-label={`Counter-clockwise ${glyph(ccw.value)}`}
                onclick={() => openTurn(index, 2)}
              >
                <span class="encoder-glyph">{glyph(ccw.value)}</span>
                <span class="encoder-dir" aria-hidden="true">↺</span>
              </button>
            {:else if !cw}
              <span class="encoder-code">{binding.value}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<KeyEditorHost
  open={!!(session.editing && session.canEdit && session.activeSlot)}
  bindingLabel={session.bindingLabel}
  behaviours={activeBinding
    ? [
        {
          code: activeBinding.value,
          name: 'Encoder',
          params: activeBinding.params.map(() => 'code')
        }
      ]
    : session.behaviours}
  editorSlots={session.slots}
  activeCodeIndex={session.activeSlot?.codeIndex ?? 0}
  choices={session.choices}
  onSelectBehaviour={session.selectBehaviour}
  onSelectValue={session.selectValue}
  onToggleHold={session.toggleHold}
  onActivateSlot={slot => session.openEditor(slot, 0)}
  onConfirm={() => {
    session.confirm()
    editing = null
  }}
  onCancel={closeEditor}
/>

<style>
  .encoder-bar {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    width: 100%;
    box-sizing: border-box;
    padding: 2px 8px 6px;
  }

  .encoder-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .encoder {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .encoder-turn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: var(--font-sm, 12px);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 6px;
  }

  .encoder-turn:hover {
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }

  .encoder-dir {
    opacity: 0.7;
  }

  .encoder-knob {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--text) 55%, transparent);
    box-sizing: border-box;
  }

  .encoder-empty,
  .encoder-code {
    margin: 0;
    font-size: var(--font-sm, 12px);
    opacity: 0.75;
  }
</style>
