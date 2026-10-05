<script lang="ts">
  import {
    HOLD_TAP_FLAVORS,
    isStockHoldTap,
    replaceHoldTapTiming,
    type HoldTapField,
    type ZmkHoldTap
  } from '@keymap-editor/keymap-core'

  interface TimingDefaults {
    tappingTermMs?: unknown
    flavor?: unknown
    quickTapMs?: unknown
    requirePriorIdleMs?: unknown
    [key: string]: unknown
  }

  interface Props {
    behaviourCode: string
    timingFields: readonly HoldTapField[]
    timingList: ZmkHoldTap[] | undefined
    defaults?: TimingDefaults
    autoshift: boolean
    disabled?: boolean
    stagedHoldTaps: ZmkHoldTap[] | null
    onStagedHoldTaps: (next: ZmkHoldTap[] | null) => void
    onChangeHoldTaps?: (next: ZmkHoldTap[]) => void
  }

  let {
    behaviourCode,
    timingFields,
    timingList,
    defaults,
    autoshift,
    disabled = false,
    stagedHoldTaps,
    onStagedHoldTaps,
    onChangeHoldTaps
  }: Props = $props()

  const timingNode = $derived(timingList?.find(node => node.code === behaviourCode))

  let termDraft = $state('')
  let flavorDraft = $state('')
  let quickDraft = $state('')
  let idleDraft = $state('')
  let timingSyncKey = $state('')

  function msText(value: unknown): string {
    return typeof value === 'number' ? String(value) : ''
  }

  $effect(() => {
    const key = [
      behaviourCode,
      timingNode?.tappingTermMs ?? '',
      timingNode?.flavor ?? '',
      timingNode?.quickTapMs ?? '',
      timingNode?.requirePriorIdleMs ?? '',
      defaults?.tappingTermMs ?? '',
      defaults?.flavor ?? '',
      defaults?.quickTapMs ?? '',
      defaults?.requirePriorIdleMs ?? ''
    ].join(':')
    if (key === timingSyncKey) return
    timingSyncKey = key
    termDraft = msText(timingNode?.tappingTermMs ?? defaults?.tappingTermMs)
    const flavor = timingNode?.flavor ?? defaults?.flavor
    flavorDraft = typeof flavor === 'string' ? flavor : ''
    quickDraft = msText(timingNode?.quickTapMs ?? defaults?.quickTapMs)
    idleDraft = msText(timingNode?.requirePriorIdleMs ?? defaults?.requirePriorIdleMs)
  })

  function readMs(raw: unknown): number | undefined | null {
    const text = String(raw ?? '').trim()
    if (text === '') return undefined
    const value = Number(text)
    if (!Number.isInteger(value) || value < 0) return null
    return value
  }

  function commitTiming() {
    if (disabled || !onChangeHoldTaps || timingFields.length === 0) return
    const patch: {
      tappingTermMs?: number
      flavor?: string
      quickTapMs?: number
      requirePriorIdleMs?: number
    } = {}
    if (timingFields.includes('tappingTermMs')) {
      const tappingTermMs = readMs(termDraft)
      if (tappingTermMs === null) return
      patch.tappingTermMs = tappingTermMs
    }
    if (timingFields.includes('flavor')) {
      patch.flavor = HOLD_TAP_FLAVORS.some(item => item.id === flavorDraft)
        ? flavorDraft
        : undefined
    }
    if (timingFields.includes('quickTapMs')) {
      const quickTapMs = readMs(quickDraft)
      if (quickTapMs === null) return
      patch.quickTapMs = quickTapMs
    }
    if (timingFields.includes('requirePriorIdleMs')) {
      const requirePriorIdleMs = readMs(idleDraft)
      if (requirePriorIdleMs === null) return
      patch.requirePriorIdleMs = requirePriorIdleMs
    }
    const next = replaceHoldTapTiming(timingList, behaviourCode, patch)
    if (stagedHoldTaps) {
      onStagedHoldTaps(next)
      return
    }
    onChangeHoldTaps(next)
  }
</script>

{#if timingFields.length > 0}
  <section class="key-editor-behavior" data-hold-tap-fields>
    <div class="key-editor-row">
      <p class="key-editor-section-label">Timing</p>
      <div class="key-editor-behavior-fields">
        {#if timingFields.includes('tappingTermMs')}
          <label>
            Tapping term
            <input
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              data-hold-tap-term
              {disabled}
              bind:value={termDraft}
              onchange={commitTiming}
            />
            <span>ms</span>
          </label>
        {/if}
        {#if timingFields.includes('flavor')}
          <label>
            Flavor
            <select
              data-hold-tap-flavor
              {disabled}
              bind:value={flavorDraft}
              onchange={commitTiming}
            >
              {#if isStockHoldTap(behaviourCode)}
                <option value="">Firmware default</option>
              {/if}
              {#each HOLD_TAP_FLAVORS as flavor (flavor.id)}
                <option value={flavor.id}>{flavor.label}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if timingFields.includes('quickTapMs')}
          <label>
            Quick tap
            <input
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              data-hold-tap-quick
              {disabled}
              bind:value={quickDraft}
              onchange={commitTiming}
            />
            <span>ms</span>
          </label>
        {/if}
        {#if timingFields.includes('requirePriorIdleMs')}
          <label>
            Prior idle
            <input
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              data-hold-tap-idle
              {disabled}
              bind:value={idleDraft}
              onchange={commitTiming}
            />
            <span>ms</span>
          </label>
        {/if}
      </div>
    </div>
    <p class="key-editor-note" data-hold-tap-note>
      {#if autoshift}
        Hold sends the shifted key. Changes every key that uses {behaviourCode}.
      {:else}
        Changes every key that uses {behaviourCode}.
      {/if}
    </p>
  </section>
{/if}
