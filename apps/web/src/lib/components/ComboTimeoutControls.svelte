<script lang="ts">
  import {
    COMBO_PRIOR_IDLE_MS_MAX,
    COMBO_PRIOR_IDLE_MS_MIN,
    COMBO_TIMEOUT_MS_MAX,
    COMBO_TIMEOUT_MS_MIN
  } from '@keymap-editor/keymap-core'

  interface Props {
    timeoutMs: number
    timeoutIsCustom: boolean
    priorIdleOn: boolean
    priorIdleMs: number
    onTimeoutMs: (ms: number) => void
    onTimeoutInput: (event: Event) => void
    onClearTimeout: () => void
    onPriorIdleMs: (ms: number) => void
    onPriorIdleInput: (event: Event) => void
    onClearPriorIdle: () => void
  }

  let {
    timeoutMs,
    timeoutIsCustom,
    priorIdleOn,
    priorIdleMs,
    onTimeoutMs,
    onTimeoutInput,
    onClearTimeout,
    onPriorIdleMs,
    onPriorIdleInput,
    onClearPriorIdle
  }: Props = $props()
</script>

<div class="combo-timeout" role="group" aria-label="Combo timeout">
  <div class="timeout-label-row">
    <span class="timeout-label">
      Timeout <strong>{timeoutMs}ms</strong>
      {#if !timeoutIsCustom}
        <span class="timeout-default">def</span>
      {/if}
    </span>
    <div class="timeout-presets">
      <button
        type="button"
        class="combo-btn quiet"
        class:on={timeoutMs === 30 && timeoutIsCustom}
        onclick={() => onTimeoutMs(30)}
      >
        Fast
      </button>
      <button
        type="button"
        class="combo-btn quiet"
        class:on={timeoutMs === 50}
        onclick={() => onTimeoutMs(50)}
        title="Firmware default when unmarked"
      >
        Norm
      </button>
      <button
        type="button"
        class="combo-btn quiet"
        class:on={timeoutMs === 100 && timeoutIsCustom}
        onclick={() => onTimeoutMs(100)}
      >
        Slow
      </button>
      {#if timeoutIsCustom}
        <button
          type="button"
          class="combo-btn quiet"
          onclick={onClearTimeout}
          title="Omit timeout-ms"
        >
          Def
        </button>
      {/if}
    </div>
  </div>
  <input
    class="timeout-range"
    type="range"
    min={COMBO_TIMEOUT_MS_MIN}
    max={COMBO_TIMEOUT_MS_MAX}
    step="5"
    value={timeoutMs}
    aria-label="Combo timeout in milliseconds"
    oninput={onTimeoutInput}
  />
</div>

<div class="combo-timeout" role="group" aria-label="Require prior idle">
  <div class="timeout-label-row">
    <span class="timeout-label">
      {#if priorIdleOn}
        Prior idle <strong>{priorIdleMs}ms</strong>
      {:else}
        Prior idle <span class="timeout-default">off</span>
      {/if}
    </span>
    <div class="timeout-presets">
      <button
        type="button"
        class="combo-btn quiet"
        class:on={!priorIdleOn}
        onclick={onClearPriorIdle}
        title="Omit require-prior-idle-ms"
      >
        Off
      </button>
      <button
        type="button"
        class="combo-btn quiet"
        class:on={priorIdleOn && priorIdleMs === 50}
        onclick={() => onPriorIdleMs(50)}
      >
        50
      </button>
      <button
        type="button"
        class="combo-btn quiet"
        class:on={priorIdleOn && priorIdleMs === 100}
        onclick={() => onPriorIdleMs(100)}
      >
        100
      </button>
      <button
        type="button"
        class="combo-btn quiet"
        class:on={priorIdleOn && priorIdleMs === 200}
        onclick={() => onPriorIdleMs(200)}
      >
        200
      </button>
    </div>
  </div>
  {#if priorIdleOn}
    <input
      class="timeout-range"
      type="range"
      min={COMBO_PRIOR_IDLE_MS_MIN}
      max={COMBO_PRIOR_IDLE_MS_MAX}
      step="10"
      value={priorIdleMs}
      aria-label="Require prior idle in milliseconds"
      oninput={onPriorIdleInput}
    />
  {/if}
</div>

<style>
  .combo-timeout {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .timeout-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  .timeout-label {
    color: var(--text-muted);
    font-size: 0.9em;
  }

  .timeout-label strong {
    color: var(--text);
    font-weight: 650;
  }

  .timeout-default {
    margin-left: 2px;
    font-size: 0.85em;
    opacity: 0.75;
  }

  .timeout-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    justify-content: flex-end;
  }

  .combo-btn {
    height: 22px;
    padding: 0 7px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface-sunken);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .combo-btn.quiet {
    height: 20px;
    padding: 0 5px;
    font-size: 0.9em;
  }

  .combo-btn.quiet.on {
    border-color: var(--accent, #3a7);
    background: color-mix(in srgb, var(--accent, #3a7) 16%, transparent);
  }

  .timeout-range {
    width: 100%;
    margin: 0;
    accent-color: var(--accent, #3a7);
  }
</style>
