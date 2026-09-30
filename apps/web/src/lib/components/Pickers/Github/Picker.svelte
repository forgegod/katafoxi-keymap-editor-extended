<script lang="ts">
  import { untrack } from 'svelte'
  import * as config from '../../../config'
  import github from '../../../github/api.svelte.js'
  import { githubChipLabel, githubGateAction, manageReposUrl } from '../../../github/chrome-label.js'
  import * as storage from '../../../github/storage'
  import { findBy, mapProp } from '../../../utils'
  import ValidationErrors from './ValidationErrors.svelte'
  import IconButton from '../../Common/IconButton.svelte'
  import Selector from '../../Common/Selector.svelte'
  import SourceMenu from '../SourceMenu.svelte'

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
      github: { repository: string; branch: string }
      layout: unknown
      keymap: unknown
    }) => void
    /** Parent draws the chip; this picker only fills the menu and keeps loading. */
    embedded?: boolean
    onStatus?: (status: GithubChromeStatus) => void
    onLogout?: () => void
  }

  let { onSelect, embedded = false, onStatus, onLogout }: Props = $props()

  let branchForm = $state(false)
  let branchDraft = $state('')
  let branchError = $state('')
  let creatingBranch = $state(false)

  let selectedRepoId: number | null = $state(null)
  let selectedBranchName: string | null = $state(null)
  let branches: Array<{ name: string }> = $state([])
  let loadingBranches = $state(false)
  let loadingKeyboard = $state(false)
  let loadError: { name?: string; errors?: string[] } | null = $state(null)
  let loadWarnings: string[] | null = $state(null)

  function clearSelection() {
    selectedBranchName = null
    loadError = null
    loadWarnings = null
  }

  function lintKeyboard({ layout }: { layout: Array<Record<string, unknown>> }) {
    const noKeyHasPosition = layout.every(
      key => key.row === undefined && key.col === undefined
    )

    if (noKeyHasPosition) {
      loadWarnings = [
        'Layout in info.json has no row/col definitions. Generated keymap files will not be nicely formatted.'
      ]
    }
  }

  async function reloadKeyboard() {
    const repository = findBy(github.repositories ?? [], {
      id: selectedRepoId
    })?.full_name
    const branch = selectedBranchName
    if (!repository || !branch) return

    loadingKeyboard = true
    loadError = null
    try {
      const response = await github.fetchLayoutAndKeymap(repository, branch)
      lintKeyboard(response as { layout: Array<Record<string, unknown>> })
      onSelect({
        github: { repository, branch },
        ...response
      })
    } catch {
      /* validation errors arrive via repo-validation-error */
    } finally {
      loadingKeyboard = false
    }
  }

  $effect(() => {
    let cancelled = false
    github.init().then(() => {
      if (cancelled) return
      const persistedRepoId = storage.getPersistedRepository()
      const repositories = github.repositories || []
      let nextId: number | null = null

      if (findBy(repositories, { id: persistedRepoId })) {
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
    const onAuthFailed = () => github.beginLoginFlow()
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

    storage.setPersistedRepository(repoId)
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
        loadingBranches = false

        const available = mapProp(nextBranches, 'name')
        const defaultBranch = repository.default_branch
        const previousBranch = storage.getPersistedBranch(repoId)
        const onlyBranch = nextBranches.length === 1 ? nextBranches[0].name : null

        for (const branch of [onlyBranch, previousBranch, defaultBranch]) {
          if (branch && available.includes(branch)) {
            selectedBranchName = branch
            break
          }
        }
      } catch {
        if (!cancelled) loadingBranches = false
      }
    })()

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    const repoId = selectedRepoId
    const branch = selectedBranchName
    if (!repoId || !branch) return

    storage.setPersistedBranch(repoId, branch)
    let cancelled = false

    loadingKeyboard = true
    loadError = null

    const repository = findBy(github.repositories ?? [], { id: repoId })
      ?.full_name
    if (!repository) {
      loadingKeyboard = false
      return
    }

    github
      .fetchLayoutAndKeymap(repository, branch)
      .then(response => {
        if (cancelled) return
        loadingKeyboard = false
        lintKeyboard(response as { layout: Array<Record<string, unknown>> })
        onSelect({
          github: { repository, branch },
          ...response
        })
      })
      .catch(() => {
        if (!cancelled) loadingKeyboard = false
      })

    return () => {
      cancelled = true
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

  const gate = $derived(
    githubGateAction({
      onlySource: true,
      ready,
      authorized,
      appInstalled
    })
  )

  const triggerLabel = $derived.by(() => {
    if (gate === 'login') return 'Login with GitHub'
    if (gate === 'install') return 'Add Repository'
    if (!ready || !authorized || !appInstalled) return 'GitHub'
    return githubChipLabel(selectedRepo?.full_name ?? null, repoFullNames, selectedBranchName)
  })

  const triggerTitle = $derived.by(() => {
    if (!ready || !authorized) return 'Login with GitHub'
    if (!appInstalled) return 'Add a GitHub repository'
    const full = selectedRepo?.full_name
    if (full && selectedBranchName) return `${full} · ${selectedBranchName}`
    if (full) return full
    return 'GitHub'
  })

  function runGate() {
    if (gate === 'login') github.beginLoginFlow()
    else if (gate === 'install') github.beginInstallAppFlow()
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
    const status: GithubChromeStatus = {
      ready,
      authorized,
      appInstalled,
      loading: !ready || loadingBranches || loadingKeyboard,
      repoFullName: selectedRepo?.full_name ?? null,
      repoFullNames,
      branch: selectedBranchName
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
      onclick={() => github.beginLoginFlow()}
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
        onUpdate={id => (selectedRepoId = id as number)}
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
        onUpdate={name => (selectedBranchName = String(name))}
      />
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
      <button type="button" class="menu-action" onclick={reloadKeyboard}>Reload</button>
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
          Copies {selectedBranchName} as it is on GitHub. Unpublished edits stay on the current branch.
        </p>
        {#if branchError}
          <p class="branch-error" role="alert">{branchError}</p>
        {/if}
        <div class="branch-actions">
          <button
            type="button"
            disabled={creatingBranch || !branchDraft.trim()}
            onclick={() => void submitBranch()}
          >
            {creatingBranch ? 'Creating' : 'Create'}
          </button>
          <button
            type="button"
            onclick={() => {
              branchForm = false
              branchError = ''
            }}
          >
            Cancel
          </button>
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

{#if embedded}
  {@render fields()}
{:else}
  <SourceMenu
    label={triggerLabel}
    title={triggerTitle}
    busy={!ready || loadingBranches || loadingKeyboard}
    popup={gate === null}
    onActivate={runGate}
  >
    {@render fields()}
  </SourceMenu>
{/if}

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
