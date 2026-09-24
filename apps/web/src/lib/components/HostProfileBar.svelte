<script lang="ts">
  import { onDestroy } from 'svelte'
  import { editor } from '../editor.svelte.js'
  import { STANDARD_HOST_PROFILE_ID } from '../host-profiles'
  import Modal from './Common/Modal.svelte'

  onDestroy(() => {
    editor.hostProfileNote = null
  })

  const DOWNLOAD_NOTE =
    'Скачивание раскладки для Windows и Linux появится, когда профиль будет хранить свою карту символов.'
  const HELP_NOTE =
    'Куда положить файл — вместе со скачиванием. Для профиля «Стандарт» файл не нужен: включите в системе языки из колонок.'

  let name = $state('')
  let error = $state('')

  const profiles = $derived(
    [...editor.hostProfiles].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  )

  $effect(() => {
    if (!editor.hostProfilePrompt) return
    name = ''
    error = ''
  })

  function submit(event: SubmitEvent) {
    event.preventDefault()
    void editor.confirmHostProfileName(name).then(message => {
      if (message) error = message
    })
  }
</script>

<div class="host-profile">
  <select
    aria-label="Профиль"
    value={editor.activeHostProfileId}
    onchange={event => editor.selectHostProfile(event.currentTarget.value)}
  >
    <option value={STANDARD_HOST_PROFILE_ID}>Стандарт</option>
    {#each profiles as profile (profile.id)}
      <option value={profile.id}>{profile.name}</option>
    {/each}
  </select>
  <button
    type="button"
    class="profile-icon"
    title="Сохранить как новый профиль"
    aria-label="Сохранить как новый профиль"
    onclick={() => editor.beginSaveHostProfile()}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 21v-6h8v6" />
    </svg>
  </button>
  <button
    type="button"
    class="profile-icon stub"
    title="Скачать раскладку для Windows и Linux"
    aria-label="Скачать раскладку для Windows и Linux"
    aria-pressed={editor.hostProfileNote === DOWNLOAD_NOTE}
    onclick={() => editor.showHostProfileStub(DOWNLOAD_NOTE)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  </button>
  <button
    type="button"
    class="profile-icon stub"
    title="Куда установить раскладку"
    aria-label="Куда установить раскладку"
    aria-pressed={editor.hostProfileNote === HELP_NOTE}
    onclick={() => editor.showHostProfileStub(HELP_NOTE)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.5 1-1.5 2.2" />
      <path d="M12 17.5h.01" />
    </svg>
  </button>
  {#if editor.hostProfileNote}
    <p class="profile-note" role="status">{editor.hostProfileNote}</p>
  {/if}
</div>

{#if editor.hostProfilePrompt}
  <Modal onBackdrop={() => editor.cancelHostProfilePrompt()}>
    <form class="profile-dialog" onsubmit={submit}>
      <h2>
        {editor.hostProfilePrompt.kind === 'fork' ? 'Новый профиль' : 'Сохранить как'}
      </h2>
      <p>
        {#if editor.hostProfilePrompt.kind === 'fork'}
          Стандартный профиль не меняется. Введите имя для этой раскладки.
        {:else}
          Текущая раскладка сохранится отдельным профилем.
        {/if}
      </p>
      <input
        bind:value={name}
        aria-label="Имя профиля"
        placeholder="Имя профиля"
        maxlength="40"
      />
      {#if error}
        <p class="profile-error" role="alert">{error}</p>
      {/if}
      <div class="profile-actions">
        <button type="submit">Сохранить</button>
        <button type="button" onclick={() => editor.cancelHostProfilePrompt()}>Отмена</button>
      </div>
    </form>
  </Modal>
{/if}

<style>
  .host-profile {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .host-profile select {
    max-width: 11rem;
    min-height: 26px;
    padding: 2px 6px;
  }

  :global(#actions) button.profile-icon {
    width: 26px;
    height: 26px;
    padding: 0;
    margin: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  :global(#actions) button.profile-icon.stub {
    background: transparent;
    color: #555;
    border: 1px solid #ccc;
    box-shadow: none;
  }

  :global(#actions) button.profile-icon.stub:hover,
  :global(#actions) button.profile-icon.stub[aria-pressed='true'] {
    background: rgba(0, 0, 0, 0.06);
  }

  .profile-icon svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .profile-note {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
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
</style>
