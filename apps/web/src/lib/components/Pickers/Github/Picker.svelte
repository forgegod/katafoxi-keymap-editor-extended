<script lang="ts">
  import { untrack } from 'svelte'
  import type { HostKeymapSnapshot, LayoutKey, ParsedKeymap, RepositoryKeymapSelection } from '@keymap-editor/keymap-core'
  import type { GithubMeta, HostSnapshotLoadError } from '../../../editor/types.js'
  import type { KeyboardFilesResult } from '../../../github/api.svelte.js'
  import * as config from '../../../config'
  import { editor } from '../../../editor.svelte.js'
  import github from '../../../github/api.svelte.js'
  import { manageReposUrl } from '../../../github/chrome-label.js'
  import * as storage from '../../../github/storage'
  import { findBy, mapProp } from '../../../utils'
  import ValidationErrors from './ValidationErrors.svelte'
  import IconButton from '../../Common/IconButton.svelte'
  import Button from '../../Common/Button.svelte'
  import Selector from '../../Common/Selector.svelte'

  export interface GithubChromeStatus {
    ready: boolean
    authorized: boolean
    appInstalled: boolean
    loading: boolean
    repoFullName: string | null
    repoFullNames: string[]
    branch: string | null
  }

  interface Props {
    onSelect: (event: {
      github: GithubMeta
      layout: LayoutKey[]
      keymap: ParsedKeymap
      hostSnapshot?: HostKeymapSnapshot | null
      hostSnapshotError?: HostSnapshotLoadError
      warnings?: string[]
      /** Keep unpublished edits + Host legend when switching after Create branch. */
      preserveSession?: boolean
      /** True for Reload / repo-or-branch change, not the automatic mount load. */
      userInitiated?: boolean
    }) => void | Promise<void>
    onStatus?: (status: GithubChromeStatus) => void
    onLogout?: () => void
  }

  let { onSelect, onStatus, onLogout }: Props = $props()

  let branchForm = $state(false)
  let branchDraft = $state('')
  let branchError = $state('')
  let creatingBranch = $state(false)
  /** Next keymap load after Create branch keeps the live editor session. */
  let preserveSessionOnLoad = $state(false)

  let selectedRepoId: number | null = $state(null)
  let selectedBranchName: string | null = $state(null)
  let branches: Array<{ name: string }> = $state([])
  let loadingBranches = $state(false)
  let loadingKeyboard = $state(false)
  let keymaps = $state<Array<{ name: string; path: string }>>([])
  let loadingKeymaps = $state(false)
  let selectedKeymapPath = $state<string | null>(null)
  let loadError: { name?: string; errors?: string[] } | null = $state(null)
  let loadWarnings: string[] | null = $state(null)
  /** Shared by effect loads and Reload so a late response cannot overwrite a newer one. */
  let keyboardLoadGeneration = 0
  let loadedMeta: GithubMeta | null = null
  let acceptedControls: { repoId: number; branch: string; path: string | null; branches: typeof branches; keymaps: typeof keymaps } | null = null
  // Restoring accepted controls is not a new network selection.
  let rollbackRepoId: number | null = null
  let rollbackBranch: string | null = null

  function restoreAcceptedControls() {
    if (!acceptedControls) return
    const accepted = acceptedControls
    if (selectedRepoId !== accepted.repoId) rollbackRepoId = accepted.repoId
    if (selectedRepoId !== accepted.repoId || selectedBranchName !== accepted.branch) rollbackBranch = accepted.branch
    selectedRepoId = accepted.repoId
    selectedBranchName = accepted.branch
    selectedKeymapPath = accepted.path
    branches = accepted.branches
    keymaps = accepted.keymaps
    loadingBranches = false
    loadingKeyboard = false
    loadingKeymaps = false
    preserveSessionOnLoad = false
    nextLoadUserInitiated = false
  }

  function selectedFile(repository: string, branch: string, carry = false): RepositoryKeymapSelection[] {
    const live = loadedMeta ?? (editor.source === 'github' ? editor.githubMeta : null)
    if (live?.repository === repository && (live.branch === branch || carry) && live.keymapPath) {
      return [{ keymapPath: live.keymapPath, ...(live.ownershipMode ? { expectedMode: live.ownershipMode } : {}) }]
    }
    const stored = storage.getPersistedKeymap(repository, branch)
    return stored ? [stored] : []
  }

  function fileMeta(repository: string, branch: string, response: KeyboardFilesResult): GithubMeta {
    return { repository, branch, headSha: response.headSha,
      ...(response.keymapPath ? { keymapPath: response.keymapPath } : {}),
      ...(response.ownershipMode ? { ownershipMode: response.ownershipMode } : {}),
      ...(response.jsonChoiceRequired !== undefined ? { jsonChoiceRequired: response.jsonChoiceRequired } : {}) }
  }

  function rememberAcceptedFile(candidate: GithubMeta, generation: number) {
    if (generation !== keyboardLoadGeneration) return
    const accepted = editor.githubMeta
    if (editor.source !== 'github' ||
        accepted?.repository !== candidate.repository || accepted.branch !== candidate.branch ||
        accepted.keymapPath !== candidate.keymapPath) {
      restoreAcceptedControls()
      return
    }
    loadedMeta = { ...accepted }
    const repo = findBy(github.repositories ?? [], { full_name: accepted.repository })
    if (repo) {
      selectedKeymapPath = accepted.keymapPath ?? selectedKeymapPath
      acceptedControls = { repoId: repo.id, branch: accepted.branch, path: selectedKeymapPath, branches: [...branches], keymaps: [...keymaps] }
      storage.setPersistedRepository(repo.id)
      storage.setPersistedBranch(repo.id, accepted.branch)
    }
    if (accepted.keymapPath) storage.setPersistedKeymap(accepted.repository, accepted.branch, {
      keymapPath: accepted.keymapPath,
      ...(accepted.ownershipMode ? { expectedMode: accepted.ownershipMode } : {})
    })
  }
  /** Next keymap fetch was started by Reload, repo/branch change, or Create branch. */
  let nextLoadUserInitiated = false

  function clearSelection() {
    loadError = null
    loadWarnings = null
  }

  function lintKeyboard({ layout }: { layout: LayoutKey[] }) {
    const noKeyHasPosition = layout.every(
      key => key.row === undefined && key.col === undefined
    )

    if (noKeyHasPosition) {
      loadWarnings = [
        'Layout in info.json has no row/col definitions. Generated keymap files will not be nicely formatted.'
      ]
    }
  }

  /** Surface non-validation load failures; 400s arrive via repo-validation-error. */
  function applyLoadFailure(err: unknown) {
    const requestErr = err as {
      message?: string
      response?: { status?: number; data?: unknown }
    }
    if (requestErr.response?.status === 400) return

    const data = requestErr.response?.data
    if (data && typeof data === 'object') {
      const payload = data as { name?: string; errors?: unknown[]; message?: string }
      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        loadError = {
          name: payload.name || 'Error',
          errors: payload.errors.map(String)
        }
        return
      }
      if (typeof payload.message === 'string' && payload.message) {
        loadError = {
          name: payload.name || 'Error',
          errors: [payload.message]
        }
        return
      }
    }

    loadError = {
      name: 'Error',
      errors: [
        typeof requestErr.message === 'string' && requestErr.message
          ? requestErr.message
          : 'Failed to load keyboard from GitHub.'
      ]
    }
  }

  async function reloadKeyboard(path = selectedKeymapPath) {
    const repository = findBy(github.repositories ?? [], {
      id: selectedRepoId
    })?.full_name
    const branch = selectedBranchName
    if (!repository || !branch || !path) return

    const previousPath = selectedKeymapPath
    selectedKeymapPath = path
    const generation = ++keyboardLoadGeneration
    loadingKeyboard = true
    loadError = null
    try {
      const response = await github.fetchLayoutAndKeymap(repository, branch, { ...selectedFile(repository, branch)[0], keymapPath: path })
      if (generation !== keyboardLoadGeneration) return
      lintKeyboard(response)
      const meta = fileMeta(repository, branch, response)
      await onSelect({
        github: meta,
        ...response,
        userInitiated: true
      })
      rememberAcceptedFile(meta, generation)
    } catch (err) {
      if (generation !== keyboardLoadGeneration) return
      selectedKeymapPath = previousPath
      restoreAcceptedControls()
      applyLoadFailure(err)
    } finally {
      if (generation === keyboardLoadGeneration) {
        loadingKeyboard = false
      }
    }
  }

  $effect(() => {
    let cancelled = false
    github.init().then(() => {
      if (cancelled) return
      const persistedRepoId = storage.getPersistedRepository()
      const repositories = github.repositories || []
      let nextId: number | null = null
      const live = editor.source === 'github' ? editor.githubMeta : null
      const liveRepo = live && findBy(repositories, { full_name: live.repository })

      if (live && liveRepo) {
        nextId = liveRepo.id
        loadedMeta = { ...live }
        acceptedControls = { repoId: liveRepo.id, branch: live.branch, path: live.keymapPath ?? null,
          branches: [{ name: live.branch }],
          keymaps: live.keymapPath ? [{ name: live.keymapPath, path: live.keymapPath }] : [] }
      } else if (findBy(repositories, { id: persistedRepoId })) {
        nextId = persistedRepoId
      } else if (repositories.length > 0) {
        nextId = repositories[0].id
      }

      selectedRepoId = nextId
    })
    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    const onAuthFailed = () => {
      void beginLoginFlow()
    }
    github.on('authentication-failed', onAuthFailed)
    return () => github.off('authentication-failed', onAuthFailed)
  })

  $effect(() => {
    const onValidation = (err: unknown) => {
      loadError = err as { name?: string; errors?: string[] }
      loadingKeyboard = false
    }
    github.on('repo-validation-error', onValidation)
    return () => github.off('repo-validation-error', onValidation)
  })

  $effect(() => {
    const repoId = selectedRepoId
    if (!repoId) return
    if (repoId === rollbackRepoId) {
      rollbackRepoId = null
      return
    }

    let cancelled = false
    selectedBranchName = null
    branches = []

    ;(async () => {
      loadingBranches = true
      const repository = findBy(github.repositories ?? [], { id: repoId })
      if (!repository) {
        loadingBranches = false
        return
      }
      try {
        const nextBranches = await github.fetchRepoBranches(repository)
        if (cancelled) return

        branches = nextBranches
        if (acceptedControls?.repoId === repoId) acceptedControls.branches = [...nextBranches]
        loadingBranches = false

        const available = mapProp(nextBranches, 'name')
        const defaultBranch = repository.default_branch
        const previousBranch = acceptedControls?.repoId === repoId ? acceptedControls.branch : storage.getPersistedBranch(repoId)
        const onlyBranch = nextBranches.length === 1 ? nextBranches[0].name : null

        for (const branch of [onlyBranch, previousBranch, defaultBranch]) {
          if (branch && available.includes(branch)) {
            selectedBranchName = branch
            break
          }
        }
        if (nextBranches.length === 0) restoreAcceptedControls()
      } catch (err) {
        if (!cancelled) {
          loadingBranches = false
          restoreAcceptedControls()
          applyLoadFailure(err)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    const repoId = selectedRepoId
    const branch = selectedBranchName
    if (branch && branch === rollbackBranch) {
      rollbackBranch = null
      return
    }
    if (!repoId || !branch) {
      loadingKeyboard = false
      return
    }

    const generation = ++keyboardLoadGeneration

    loadingKeymaps = true
    keymaps = []
    selectedKeymapPath = null
    loadError = null

    const repository = findBy(github.repositories ?? [], { id: repoId })
      ?.full_name
    if (!repository) {
      if (generation === keyboardLoadGeneration) loadingKeyboard = false
      return
    }

    const remembered = untrack(() => selectedFile(repository, branch, preserveSessionOnLoad)[0])
    github.fetchKeymaps(repository, branch)
      .then(async inventory => {
        if (generation !== keyboardLoadGeneration) return null
        keymaps = inventory.candidates
        loadingKeymaps = false
        if (keymaps.length === 0) {
          loadError = { name: 'No eligible keymap files', errors: ['No eligible keymap files in config/. The current editor and recovery are unchanged.'] }
          restoreAcceptedControls()
          return null
        }
        const path = remembered?.keymapPath ?? (keymaps.length === 1 ? keymaps[0].path : null)
        if (path && !keymaps.some(item => item.path === path)) {
          loadError = { name: 'Missing selected keymap', errors: [`${path} is missing. Choose a file explicitly; local recovery is unchanged.`] }
          restoreAcceptedControls()
          return null
        }
        selectedKeymapPath = path
        if (!path) return null
        loadingKeyboard = true
        return github.fetchLayoutAndKeymap(repository, branch, { ...remembered, keymapPath: path })
      })
      .then(async response => {
        if (generation !== keyboardLoadGeneration || !response) return
        lintKeyboard(response)
        const preserveSession = preserveSessionOnLoad
        preserveSessionOnLoad = false
        const userInitiated = nextLoadUserInitiated
        nextLoadUserInitiated = false
        const meta = fileMeta(repository, branch, response)
        await onSelect({
          github: meta,
          ...(preserveSession ? { preserveSession: true } : {}),
          ...(userInitiated ? { userInitiated: true } : {}),
          ...response
        })
        rememberAcceptedFile(meta, generation)
        if (generation === keyboardLoadGeneration) loadingKeyboard = false
      })
      .catch(err => {
        if (generation !== keyboardLoadGeneration) return
        loadingKeyboard = false
        loadingKeymaps = false
        preserveSessionOnLoad = false
        nextLoadUserInitiated = false
        restoreAcceptedControls()
        applyLoadFailure(err)
      })

    return () => {
      keyboardLoadGeneration += 1
    }
  })

  const selectedRepo = $derived(
    findBy(github.repositories ?? [], { id: selectedRepoId }) ?? null
  )

  const repoFullNames = $derived((github.repositories ?? []).map(repo => repo.full_name))

  const repositoryChoices = $derived(
    (github.repositories || []).map(repo => ({
      id: repo.id,
      name: repo.full_name,
      title: repo.full_name
    }))
  )

  const branchChoices = $derived(
    branches.map(branch => ({
      id: branch.name,
      name: branch.name
    }))
  )

  const authorized = $derived(github.isGitHubAuthorized())
  const appInstalled = $derived(github.isAppInstalled())
  const ready = $derived(github.initialized)

  async function beginLoginFlow() {
    await editor.flushPendingPersist()
    github.beginLoginFlow()
  }

  function beginBranchForm() {
    branchForm = true
    branchDraft = ''
    branchError = ''
  }

  async function submitBranch() {
    const repository = selectedRepo?.full_name
    const from = selectedBranchName
    if (!repository || !from || creatingBranch) return
    creatingBranch = true
    branchError = ''
    try {
      const created = await github.createBranch(repository, branchDraft, from)
      if (!branches.some(branch => branch.name === created.name)) {
        branches = [...branches, { name: created.name }]
      }
      preserveSessionOnLoad = true
      nextLoadUserInitiated = true
      selectedBranchName = created.name
      branchForm = false
      branchDraft = ''
    } catch (err) {
      const data = (err as { response?: { data?: { errors?: unknown } } }).response?.data
      const message = Array.isArray(data?.errors) ? data.errors.find(item => typeof item === 'string') : null
      branchError = typeof message === 'string' ? message : 'Could not create the branch'
    } finally {
      creatingBranch = false
    }
  }

  async function logOut() {
    await github.logout()
    onLogout?.()
    selectedRepoId = null
    selectedBranchName = null
    branches = []
    branchForm = false
  }

  $effect(() => {
    const accepted = editor.source === 'github' ? editor.githubMeta : null
    const status: GithubChromeStatus = {
      ready,
      authorized,
      appInstalled,
      loading: !ready || loadingBranches || loadingKeymaps || loadingKeyboard,
      repoFullName: accepted?.repository ?? selectedRepo?.full_name ?? null,
      repoFullNames,
      branch: accepted?.branch ?? selectedBranchName
    }
    untrack(() => onStatus?.(status))
  })
</script>

{#snippet fields()}
  {#if ready && !authorized}
    <IconButton
      collection="brands"
      icon="github"
      text="Login with GitHub"
      onclick={() => beginLoginFlow()}
    />
  {:else if ready && !appInstalled}
    <IconButton
      collection="brands"
      icon="github"
      text="Add Repository"
      onclick={() => github.beginInstallAppFlow()}
    />
  {:else if ready}
    {#if repositoryChoices.length === 1}
      <div class="identity-line">
        <span class="identity-k">Repository</span>
        <span class="identity-v repo-value" title={repositoryChoices[0].title}>
          {repositoryChoices[0].title}
        </span>
      </div>
    {:else if repositoryChoices.length > 1}
      <Selector
        id="repo"
        label="Repository"
        value={selectedRepoId}
        choices={repositoryChoices}
        onUpdate={id => {
          nextLoadUserInitiated = true
          selectedRepoId = id as number
        }}
      />
    {/if}

    {#if !loadingBranches && branchChoices.length === 1}
      <div class="identity-line">
        <span class="identity-k">Branch</span>
        <span class="identity-v branch-value">{branchChoices[0].name}</span>
      </div>
    {:else if !loadingBranches && branchChoices.length > 1}
      <Selector
        id="branch"
        label="Branch"
        value={selectedBranchName}
        choices={branchChoices}
        onUpdate={name => {
          nextLoadUserInitiated = true
          selectedBranchName = String(name)
        }}
      />
    {/if}

    {#if loadingKeymaps}
      <p role="status">Loading keymap files…</p>
    {:else if selectedBranchName}
      {#if keymaps.length === 0}
        <p role="status">No eligible keymap files in config/. The current editor and recovery are unchanged.</p>
      {:else}
        <div class="keymap-field">
        <label class="identity-k" for="keymap-file">Keymap file</label>
        <select id="keymap-file" value={selectedKeymapPath ?? ''} onchange={event => void reloadKeyboard(event.currentTarget.value)}>
          <option value="" disabled>Choose a keymap file</option>
          {#each keymaps as file}
            <option value={file.path}>{file.path}</option>
          {/each}
        </select>
        </div>
      {/if}
    {/if}

    {#if loadError}
      <ValidationErrors
        title={loadError.name || 'Error'}
        errors={loadError.errors || []}
        otherRepoOrBranchAvailable={
          repositoryChoices.length > 1 || branchChoices.length > 0
        }
        onDismiss={clearSelection}
      />
    {/if}
    {#if loadWarnings}
      <ValidationErrors
        title="Warning"
        errors={loadWarnings}
        onDismiss={() => (loadWarnings = null)}
      />
    {/if}

    {#if selectedBranchName && !loadingKeyboard}
      <button type="button" class="menu-action" disabled={!selectedKeymapPath} onclick={() => void reloadKeyboard()}>Reload</button>
    {/if}

    <div class="menu-sep" aria-hidden="true"></div>
    {#if branchForm && selectedBranchName}
      <div class="branch-form">
        <label class="identity-k" for="new-branch">New branch</label>
        <input
          id="new-branch"
          name="branch"
          autocomplete="off"
          bind:value={branchDraft}
          placeholder="Branch name"
          onkeydown={event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            void submitBranch()
          }}
        />
        <p class="branch-hint">
          Copies {selectedBranchName} from GitHub. Keeps your unpublished edits and
          Host languages; Commit goes to the new branch.
        </p>
        {#if branchError}
          <p class="branch-error" role="alert">{branchError}</p>
        {/if}
        <div class="branch-actions">
          <Button
            variant="outline"
            disabled={creatingBranch || !branchDraft.trim()}
            onclick={() => void submitBranch()}
          >
            {creatingBranch ? 'Creating' : 'Create'}
          </Button>
          <Button
            variant="outline"
            onclick={() => {
              branchForm = false
              branchError = ''
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    {:else if selectedBranchName}
      <button type="button" class="menu-action" onclick={beginBranchForm}>Create new branch</button>
    {/if}
    <a
      class="menu-action"
      href={manageReposUrl(config.githubAppName)}
      target="_blank"
      rel="noreferrer"
    >
      {github.login ? `Manage repos for ${github.login}` : 'Manage repos'}
    </a>
    <button type="button" class="menu-action" onclick={() => void logOut()}>Log out</button>
  {/if}
{/snippet}

{@render fields()}

<style>
  .identity-line {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .identity-k {
    font-size: var(--font-sm);
    line-height: 1.15;
    color: var(--text-muted);
  }

  .identity-v {
    overflow: hidden;
    font-size: var(--font-md);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(#actions .source-popover) :is(button, a).menu-action {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    width: 100%;
    height: auto;
    min-height: 26px;
    justify-content: flex-start;
    padding: 4px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  :global(#actions .source-popover) :is(button, a).menu-action:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border-color: transparent;
    color: inherit;
  }

  .menu-sep {
    height: 1px;
    margin: 2px 0;
    background: var(--fill);
  }

  .branch-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .branch-form input {
    box-sizing: border-box;
    width: 100%;
    min-height: 26px;
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    font-size: var(--font-md);
  }

  .branch-hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-xs);
  }

  .branch-error {
    margin: 0;
    color: var(--danger-ink);
    font-size: var(--font-sm);
  }

  .branch-actions {
    display: flex;
    gap: 6px;
  }
</style>
