<script lang="ts">
  import { hostLayoutChoice, hostLayoutChoiceLabel } from '@keymap-editor/keymap-core'
  import { onDestroy } from 'svelte'
  import { editor } from '../editor.svelte.js'
  import Modal from './Common/Modal.svelte'

  function layoutLabel(id: string): string {
    const user = editor.userLayouts.find(layout => layout.id === id)
    if (user) return user.name
    const choice = hostLayoutChoice(id)
    return choice ? hostLayoutChoiceLabel(choice) : ''
  }

  onDestroy(() => {
    editor.hostProfileNote = null
  })

  let name = $state('')
  let error = $state('')

  const prompt = $derived(editor.hostProfilePrompt)
  const promptLanguage = $derived(prompt?.language)
  const targetProfile = $derived.by(() => {
    if (!prompt || !promptLanguage) return undefined
    const id =
      prompt.kind === 'rename' || prompt.kind === 'delete'
        ? prompt.profileId
        : editor.activeProfileId(promptLanguage)
    return editor.profilesForLanguage(promptLanguage).find(profile => profile.id === id)
  })
  const activeProfileName = $derived.by(() => {
    if (!prompt || !promptLanguage) return ''
    if (prompt.kind === 'copy' && prompt.layoutId) {
      const choice = hostLayoutChoice(prompt.layoutId)
      if (choice) return hostLayoutChoiceLabel(choice)
    }
    return (
      layoutLabel(editor.activeProfileId(promptLanguage)) ||
      targetProfile?.name ||
      ''
    )
  })

  $effect(() => {
    const current = editor.hostProfilePrompt
    if (!current) return
    error = ''
    name = current.kind === 'rename' ? (targetProfile?.name ?? '') : ''
  })

  function submit(event: SubmitEvent) {
    event.preventDefault()
    void editor.confirmHostProfileName(name).then(message => {
      if (message) error = message
    })
  }
</script>

{#if editor.hostProfileNote}
  <p class="profile-note" role="status">{editor.hostProfileNote}</p>
{/if}

{#if editor.hostProfilePrompt}
  <Modal onBackdrop={() => editor.cancelHostProfilePrompt()}>
    <form class="profile-dialog" onsubmit={submit}>
      <h2>
        {#if editor.hostProfilePrompt.kind === 'rename'}
          Rename
        {:else if editor.hostProfilePrompt.kind === 'delete'}
          Delete profile
        {:else if editor.hostProfilePrompt.kind === 'copy'}
          Copy profile
        {:else}
          Save as
        {/if}
      </h2>
      <p>
        {#if editor.hostProfilePrompt.kind === 'rename'}
          New name for “{targetProfile?.name}”.
        {:else if editor.hostProfilePrompt.kind === 'delete'}
          Profile “{targetProfile?.name}” will be removed from this browser.
        {:else if editor.hostProfilePrompt.kind === 'copy'}
          A copy of “{activeProfileName}” will be saved under a new name.
        {:else}
          The current layout for this language will be saved as a separate profile.
        {/if}
      </p>
      {#if editor.hostProfilePrompt.kind !== 'delete'}
      <input
        bind:value={name}
        aria-label="Profile name"
        placeholder="Profile name"
        maxlength="40"
      />
      {#if error}
        <p class="profile-error" role="alert">{error}</p>
      {/if}
      {/if}
      <div class="profile-actions">
        {#if editor.hostProfilePrompt.kind === 'delete'}
          <button type="button" class="danger" onclick={() => editor.deleteActiveHostProfile()}>
            Delete
          </button>
        {:else if editor.hostProfilePrompt.kind === 'copy'}
          <button type="submit">Copy</button>
        {:else}
          <button type="submit">Save</button>
        {/if}
        <button type="button" onclick={() => editor.cancelHostProfilePrompt()}>Cancel</button>
      </div>
    </form>
  </Modal>
{/if}

<style>
  .profile-note {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 6;
    width: min(280px, 70vw);
    margin: 0;
    padding: 8px 10px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border-soft);
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    font-size: var(--font-md);
    line-height: 1.35;
  }

  .profile-dialog {
    width: min(360px, 86vw);
    padding: 16px 18px 14px;
    background: var(--surface);
    color: var(--text);
    border-radius: 8px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }

  .profile-dialog h2 {
    margin: 0 0 8px;
    font-size: var(--font-xl);
    font-weight: 600;
  }

  .profile-dialog p {
    margin: 0 0 12px;
    font-size: var(--font-md);
    line-height: 1.4;
  }

  .profile-dialog input {
    box-sizing: border-box;
    width: 100%;
    margin: 0 0 8px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
  }

  .profile-error {
    color: var(--danger-ink);
  }

  .profile-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .profile-actions button {
    cursor: pointer;
    border: none;
    border-radius: 5px;
    padding: 6px 12px;
    font: inherit;
  }

  .profile-actions button[type='submit'] {
    background: var(--hover-selection);
    color: var(--on-accent);
  }

  .profile-actions button[type='button'] {
    background: var(--fill-subtle);
    color: var(--text);
  }

  .profile-actions button.danger {
    background: var(--danger-wash);
    color: var(--danger-ink);
  }
</style>
