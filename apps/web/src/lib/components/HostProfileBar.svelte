<script lang="ts">
  import { onDestroy } from 'svelte'
  import { editor } from '../editor.svelte.js'
  import { builtinProfileLabel } from '../host-profiles'
  import Modal from './Common/Modal.svelte'

  onDestroy(() => {
    editor.hostProfileNote = null
  })

  let name = $state('')
  let error = $state('')

  const promptLanguage = $derived(editor.hostProfilePrompt?.language)
  const activeUserProfile = $derived(
    promptLanguage
      ? editor.profilesForLanguage(promptLanguage).find(
          profile => profile.id === editor.activeProfileId(promptLanguage)
        )
      : undefined
  )
  const activeProfileName = $derived(
    promptLanguage
      ? (builtinProfileLabel(editor.activeProfileId(promptLanguage)) ??
          activeUserProfile?.name ??
          '')
      : ''
  )

  $effect(() => {
    const prompt = editor.hostProfilePrompt
    if (!prompt) return
    error = ''
    name = prompt.kind === 'rename' ? (activeUserProfile?.name ?? '') : ''
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
          Переименовать
        {:else if editor.hostProfilePrompt.kind === 'delete'}
          Удалить профиль
        {:else if editor.hostProfilePrompt.kind === 'copy'}
          Скопировать профиль
        {:else}
          Сохранить как
        {/if}
      </h2>
      <p>
        {#if editor.hostProfilePrompt.kind === 'rename'}
          Новое имя для «{activeUserProfile?.name}».
        {:else if editor.hostProfilePrompt.kind === 'delete'}
          Профиль «{activeUserProfile?.name}» будет удалён из браузера.
        {:else if editor.hostProfilePrompt.kind === 'copy'}
          Копия «{activeProfileName}» сохранится под новым именем.
        {:else}
          Текущая раскладка этого языка сохранится отдельным профилем.
        {/if}
      </p>
      {#if editor.hostProfilePrompt.kind !== 'delete'}
      <input
        bind:value={name}
        aria-label="Имя профиля"
        placeholder="Имя профиля"
        maxlength="40"
      />
      {#if error}
        <p class="profile-error" role="alert">{error}</p>
      {/if}
      {/if}
      <div class="profile-actions">
        {#if editor.hostProfilePrompt.kind === 'delete'}
          <button type="button" class="danger" onclick={() => editor.deleteActiveHostProfile()}>
            Удалить
          </button>
        {:else if editor.hostProfilePrompt.kind === 'copy'}
          <button type="submit">Скопировать</button>
        {:else}
          <button type="submit">Сохранить</button>
        {/if}
        <button type="button" onclick={() => editor.cancelHostProfilePrompt()}>Отмена</button>
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
    background: #fff;
    color: #333;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    font-size: 13px;
    line-height: 1.35;
  }

  .profile-dialog {
    width: min(360px, 86vw);
    padding: 16px 18px 14px;
    background: #fff;
    color: #333;
    border-radius: 8px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }

  .profile-dialog h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
  }

  .profile-dialog p {
    margin: 0 0 12px;
    font-size: 14px;
    line-height: 1.4;
  }

  .profile-dialog input {
    box-sizing: border-box;
    width: 100%;
    margin: 0 0 8px;
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font: inherit;
  }

  .profile-error {
    color: #842029;
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
    color: white;
  }

  .profile-actions button[type='button'] {
    background: #eee;
    color: #333;
  }

  .profile-actions button.danger {
    background: #f8d7da;
    color: #842029;
  }
</style>
