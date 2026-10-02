<script lang="ts">
  import Button from './Common/Button.svelte'

  const STORAGE_KEY = 'welcomeBannerDismissed'

  interface Props {
    showGithub?: boolean
    onPasteKeymap?: () => void
    onConnectGithub?: () => void
  }

  let { showGithub = true, onPasteKeymap, onConnectGithub }: Props = $props()

  function readDismissed(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  }

  let dismissed = $state(readDismissed())

  function dismiss() {
    dismissed = true
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* private mode */
    }
  }

  function pasteKeymap() {
    dismiss()
    onPasteKeymap?.()
  }

  function connectGithub() {
    dismiss()
    onConnectGithub?.()
  }
</script>

{#if !dismissed}
  <div class="welcome-banner" role="status">
    <p class="welcome-copy">
      Demo keyboard — open <strong>Demo · Corne</strong> above to try Lark, Lily58, or
      Sweep. Click a key to change what it sends · Alt+click to change what your OS
      types. Bring your own:
      <button type="button" class="welcome-link" onclick={pasteKeymap}>
        Paste .keymap
      </button>
      {#if showGithub && onConnectGithub}
        <span class="welcome-sep" aria-hidden="true">·</span>
        <button type="button" class="welcome-link" onclick={connectGithub}>
          Connect GitHub
        </button>
      {/if}
    </p>
    <Button
      variant="outline"
      class="welcome-dismiss"
      title="Dismiss welcome tip"
      aria-label="Dismiss welcome tip"
      onclick={dismiss}
    >
      Dismiss
    </Button>
  </div>
{/if}

<style>
  .welcome-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin: 0 8px;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border-soft));
    border-radius: 8px;
  }

  .welcome-copy {
    flex: 1 1 16rem;
    margin: 0;
    color: var(--text);
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.4;
  }

  .welcome-copy :global(strong) {
    font-weight: 700;
  }

  .welcome-link {
    margin: 0;
    padding: 0;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    background: none;
    border: none;
    cursor: pointer;
  }

  .welcome-sep {
    margin: 0 0.15em;
    color: var(--text-muted);
  }

  .welcome-banner :global(.welcome-dismiss) {
    height: 1.7rem;
    padding: 0 8px;
    font-size: var(--font-sm, 0.85rem);
  }
</style>
