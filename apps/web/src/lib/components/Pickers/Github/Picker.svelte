<script lang="ts">
  import github from '../../../github/api'
  import * as storage from '../../../github/storage'
  import { findBy, mapProp } from '../../../utils'
  import ValidationErrors from './ValidationErrors.svelte'
  import IconButton from '../../Common/IconButton.svelte'
  import Selector from '../../Common/Selector.svelte'
  import Spinner from '../../Common/Spinner.svelte'

  interface Props {
    onSelect: (event: {
      github: { repository: string; branch: string }
      layout: unknown
      keymap: unknown
    }) => void
  }

  let { onSelect }: Props = $props()

  let initialized = $state(false)
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

  async function loadKeyboard() {
    const available = github.repositories
    const repository = findBy(available ?? [], { id: selectedRepoId })?.full_name
    const branch = selectedBranchName

    if (!repository || !branch) return

    loadingKeyboard = true
    loadError = null

    try {
      const response = await github.fetchLayoutAndKeymap(repository, branch)
      loadingKeyboard = false
      lintKeyboard(response as { layout: Array<Record<string, unknown>> })

      onSelect({
        github: { repository, branch },
        ...response
      })
    } catch {
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
      initialized = true
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

    ;(async () => {
      loadingBranches = true
      const repository = findBy(github.repositories ?? [], { id: repoId })
      if (!repository) {
        loadingBranches = false
        return
      }
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
    })()

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    if (!selectedRepoId || !selectedBranchName) return
    storage.setPersistedBranch(selectedRepoId, selectedBranchName)
    loadKeyboard()
  })

  const repositoryChoices = $derived(
    (github.repositories || []).map(repo => ({
      id: repo.id,
      name: repo.full_name
    }))
  )

  const branchChoices = $derived(
    branches.map(branch => ({
      id: branch.name,
      name: branch.name
    }))
  )
</script>

{#if initialized}
  {#if !github.isGitHubAuthorized()}
    <IconButton
      collection="brands"
      icon="github"
      text="Login with GitHub"
      onclick={() => github.beginLoginFlow()}
    />
  {:else if !github.isAppInstalled()}
    <IconButton
      collection="brands"
      icon="github"
      text="Add Repository"
      onclick={() => github.beginInstallAppFlow()}
    />
  {:else}
    <Selector
      id="repo"
      label="Repository"
      value={selectedRepoId}
      choices={repositoryChoices}
      onUpdate={id => (selectedRepoId = id as number)}
    />

    {#if loadingBranches}
      <Spinner />
    {:else if branches.length}
      <Selector
        id="branch"
        label="Branch"
        value={selectedBranchName}
        choices={branchChoices}
        onUpdate={name => (selectedBranchName = String(name))}
      />
    {/if}

    {#if loadingKeyboard}
      <Spinner />
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
      <IconButton icon="sync" onclick={loadKeyboard} />
    {/if}
  {/if}
{/if}
