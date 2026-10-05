<script lang="ts">
  interface Props {
    onEndSession?: () => void
  }

  let { onEndSession }: Props = $props()
</script>

<div class="session-bar" role="group" aria-label="Host edit session">
  <button
    type="button"
    class="session-accept"
    data-host-accept
    title="Enter"
    onclick={() => onEndSession?.()}
  >
    Accept <kbd>Enter</kbd>
  </button>
  <button
    type="button"
    class="session-cancel"
    data-host-cancel
    title="Edits are already saved — Escape only closes the session"
    onclick={() => onEndSession?.()}
  >
    Cancel <kbd>Esc</kbd>
  </button>
</div>

<style>
  .session-bar {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid color-mix(in srgb, var(--paper-shade) 12%, transparent);
  }

  .session-bar button {
    flex: 1;
    height: 30px;
    margin: 0;
    padding: 0 8px;
    border: 0;
    border-radius: 13px;
    font-family: Quicksand, avenir, sans-serif;
    font-size: var(--font-md);
    cursor: pointer;
  }

  .session-bar kbd {
    margin-left: 4px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--on-accent-wash);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--font-sm);
    font-weight: 600;
  }

  .session-cancel kbd {
    background: var(--shade-wash);
  }

  .session-accept {
    background: var(--accent);
    color: var(--on-accent);
  }

  .session-cancel {
    background: var(--fill);
    color: var(--text);
  }
</style>
