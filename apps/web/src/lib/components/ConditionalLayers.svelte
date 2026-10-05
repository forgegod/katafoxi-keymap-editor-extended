<script lang="ts">
  import {
    CONDITIONAL_LAYER_MIN_IF,
    conditionalLayerCoverWarning,
    conditionalLayerSentence,
    conditionalLayersMatch,
    nextConditionalLayerId
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'

  interface Props {
    /** True while the add form is open, so the legend strip stays expanded. */
    editing?: boolean
  }

  let { editing = $bindable(false) }: Props = $props()

  let drafting = $state(false)
  let held = $state<number[]>([])
  let shown = $state<number | null>(null)
  let notice = $state<string | null>(null)

  const names = $derived(editor.hostLegendLayerNames)
  const rules = $derived(editor.draftKeymap?.conditionalLayers ?? [])
  const canAdd = $derived(names.length >= CONDITIONAL_LAYER_MIN_IF + 1)
  const showChoices = $derived(names.map((_, index) => index).filter(index => !held.includes(index)))
  const coverWarning = $derived(
    shown == null ? null : conditionalLayerCoverWarning({ ifLayers: held, thenLayer: shown })
  )
  const addTitle = $derived.by(() => {
    if (held.length < CONDITIONAL_LAYER_MIN_IF) return 'Hold at least two layers.'
    if (shown == null) return 'Choose the layer that appears.'
    return coverWarning ?? 'Add this rule'
  })
  const canCommit = $derived(held.length >= CONDITIONAL_LAYER_MIN_IF && shown != null)

  $effect(() => {
    if (editing) return
    drafting = false
  })

  function start(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    held = []
    shown = null
    notice = null
    drafting = true
    editing = true
  }

  function cancel() {
    drafting = false
    notice = null
    editing = false
  }

  function toggleHeld(index: number) {
    notice = null
    if (held.includes(index)) held = held.filter(layer => layer !== index)
    else held = [...held, index].sort((a, b) => a - b)
    if (shown != null && held.includes(shown)) shown = null
  }

  function pickShown(index: number) {
    notice = null
    shown = shown === index ? null : index
  }

  function commit() {
    if (shown == null || held.length < CONDITIONAL_LAYER_MIN_IF) return
    const draft = { ifLayers: held, thenLayer: shown }
    if (rules.some(rule => conditionalLayersMatch(rule, draft))) {
      notice = 'That rule already exists.'
      return
    }
    const id = nextConditionalLayerId(held, names, rules)
    editor.updateConditionalLayers([
      ...rules,
      { id, ifLayers: [...held], thenLayer: shown }
    ])
    cancel()
  }

  function remove(id: string) {
    editor.updateConditionalLayers(rules.filter(rule => rule.id !== id))
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !drafting) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
</script>

{#if rules.length > 0 || canAdd}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="when-block" aria-label="Conditional layers" onkeydown={onKeydown}>
    {#each rules as rule (rule.id)}
      {@const sentence = conditionalLayerSentence(rule, names)}
      {@const warning = conditionalLayerCoverWarning(rule)}
      <div class="when-rule" class:warn={warning != null} data-conditional-rule={rule.id}>
        <span class="when-sentence" title={warning ?? sentence}>{sentence}</span>
        <button
          type="button"
          class="when-remove"
          aria-label={`Remove ${sentence}`}
          title={warning ?? 'Remove this rule'}
          onclick={() => remove(rule.id)}
        >
          ×
        </button>
      </div>
    {/each}

    {#if drafting}
      <p class="when-hint">
        Hold two or more layers. The one marked shows appears while they are all held.
      </p>
      <div class="when-draft">
        <span class="when-kicker" style:grid-row="1" style:grid-column="1">Hold</span>
        {#each names as name, index (index)}
          <button
            type="button"
            class="when-chip"
            class:on={held.includes(index)}
            style:grid-row="1"
            style:grid-column={index + 2}
            aria-pressed={held.includes(index)}
            aria-label={`Hold ${name}`}
            onclick={() => toggleHeld(index)}
          >
            {name}
          </button>
        {/each}
        <span class="when-kicker" style:grid-row="2" style:grid-column="1">→ shows</span>
        {#each names as name, index (index)}
          <button
            type="button"
            class="when-chip then"
            class:on={shown === index}
            style:grid-row="2"
            style:grid-column={index + 2}
            disabled={held.includes(index)}
            aria-pressed={shown === index}
            aria-label={`Show ${name}`}
            onclick={() => pickShown(index)}
          >
            {name}
          </button>
        {/each}
        <button
          type="button"
          class="when-commit"
          style:grid-row="2"
          style:grid-column={names.length + 2}
          disabled={!canCommit}
          title={addTitle}
          onclick={commit}
        >
          Add
        </button>
        <button
          type="button"
          class="when-cancel"
          style:grid-row="2"
          style:grid-column={names.length + 3}
          onclick={cancel}
        >
          Cancel
        </button>
      </div>
      {#if showChoices.length === 0}
        <p class="when-note">Leave a layer out of the hold set. That layer is the one that appears.</p>
      {:else if coverWarning}
        <p class="when-note">{coverWarning}</p>
      {/if}
      {#if notice}
        <p class="when-note" role="status">{notice}</p>
      {/if}
    {:else if canAdd}
      <button
        type="button"
        class="add-when"
        title="Hold two or more layers, then choose the layer that appears."
        onclick={start}
      >
        Add conditional layer
      </button>
    {/if}
  </div>
{/if}

<style>
  .when-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    padding: 2px 0 4px;
    white-space: normal;
    font-size: var(--font-sm);
    font-weight: 400;
    color: var(--text-muted);
  }

  .when-hint {
    margin: 0;
    max-width: 36em;
    color: var(--text-muted);
    font-size: var(--font-xs);
  }

  .when-rule {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .when-draft {
    display: grid;
    column-gap: 4px;
    row-gap: 4px;
    align-items: center;
    justify-items: stretch;
  }

  .when-sentence {
    color: var(--text);
  }

  .when-rule.warn .when-sentence {
    color: var(--warn-ink);
  }

  .when-kicker {
    justify-self: end;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .when-chip,
  .when-remove,
  .when-commit,
  .when-cancel,
  .add-when {
    margin: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .when-chip {
    padding: 0 6px;
    border: 1px solid color-mix(in srgb, var(--shade) 28%, transparent);
    border-radius: 999px;
    white-space: nowrap;
    text-align: center;
  }

  .when-chip:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .when-chip.on {
    color: var(--accent);
    border-color: var(--accent);
  }

  .when-chip.then.on {
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .add-when,
  .when-commit {
    padding: 1px 0;
    color: var(--accent);
  }

  .add-when {
    display: block;
    width: 100%;
    text-align: left;
  }

  .add-when:hover,
  .when-commit:hover:not(:disabled) {
    text-decoration: underline;
  }

  .when-commit:disabled {
    color: var(--text-disabled);
    cursor: default;
  }

  .when-remove {
    padding: 0 2px;
    color: var(--text-disabled);
    font-size: var(--font-md);
    line-height: 1;
  }

  .when-remove:hover {
    color: var(--danger);
  }

  .when-note {
    margin: 0;
    max-width: 36em;
    color: var(--warn-ink);
    font-size: var(--font-xs);
  }
</style>
