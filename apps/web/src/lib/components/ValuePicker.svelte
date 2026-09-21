<script lang="ts">
  import fuzzysort from 'fuzzysort'
  import { onMount } from 'svelte'
  import './ValuePicker.css'

  interface Choice {
    code?: string | number
    description?: string
    [key: string]: unknown
  }

  interface Props {
    target?: HTMLElement | EventTarget | null
    value: string | number
    param: unknown
    choices: Choice[]
    prompt: string
    searchKey?: string
    searchThreshold?: number
    showAllThreshold?: number
    onCancel: () => void
    onSelect: (result: Choice) => void
  }

  let {
    value,
    choices,
    prompt,
    searchKey = 'code',
    searchThreshold = 10,
    showAllThreshold = 50,
    onCancel,
    onSelect
  }: Props = $props()

  let listEl: HTMLUListElement | undefined = $state()
  let query: string | null = $state(null)
  let highlighted: number | null = $state(null)
  let showAll = $state(false)

  const results = $derived.by(() => {
    const options = { key: searchKey, limit: 30 }
    const filtered = fuzzysort.go(query || '', choices, options)

    if (showAll || searchThreshold > choices.length) {
      return choices
    } else if (!query) {
      return choices.slice(0, searchThreshold)
    }

    return filtered.map(result => ({
      ...result.obj,
      search: result
    })) as Array<Choice & { search?: { score: number } }>
  })

  const enableShowAllButton = $derived(
    !showAll &&
      choices.length > searchThreshold &&
      choices.length <= showAllThreshold
  )

  function cycle(array: unknown[], index: number, step = 1) {
    const next = (index + step) % array.length
    return next < 0 ? array.length + next : next
  }

  function scrollIntoViewIfNeeded(element: HTMLElement, alignToTop: boolean) {
    const parent = element.offsetParent as HTMLElement | null
    if (!parent) return
    const scroll = parent.scrollTop
    const height = parent.offsetHeight
    const top = element.offsetTop
    const bottom = top + element.scrollHeight

    if (top < scroll || bottom > scroll + height) {
      element.scrollIntoView(alignToTop)
    }
  }

  function handleClickResult(result: Choice) {
    onSelect(result)
  }

  function handleBodyClick(event: MouseEvent) {
    const root = listEl?.closest('.dialog')
    if (root && !root.contains(event.target as Node)) {
      onCancel()
    }
  }

  function handleSelectActive() {
    if (results.length > 0 && highlighted !== null) {
      handleClickResult(results[highlighted])
    }
  }

  function setHighlightPosition(initial: number, offset?: number) {
    if (results.length === 0) {
      highlighted = null
      return
    }
    if (offset === undefined) {
      highlighted = initial
      return
    }

    const next =
      highlighted !== null ? cycle(results, highlighted, offset) : initial

    const selector = `li[data-result-index="${next}"]`
    const element = listEl?.querySelector(selector) as HTMLElement | null
    if (element) scrollIntoViewIfNeeded(element, false)
    highlighted = next
  }

  function handleHighlightNext() {
    setHighlightPosition(0, 1)
  }

  function handleHighlightPrev() {
    setHighlightPosition(results.length - 1, -1)
  }

  function handleKeyPress(event: Event) {
    query = (event.target as HTMLInputElement).value
  }

  function handleKeyDown(event: KeyboardEvent) {
    const mapping: Record<string, () => void> = {
      ArrowDown: handleHighlightNext,
      ArrowUp: handleHighlightPrev,
      Enter: handleSelectActive,
      Escape: onCancel
    }

    const action = mapping[event.key]
    if (action) {
      event.stopPropagation()
      action()
    }
  }

  function focusSearch(node: HTMLInputElement) {
    node.focus()
    node.select()
  }

  onMount(() => {
    document.body.addEventListener('click', handleBodyClick)
    return () => {
      document.body.removeEventListener('click', handleBodyClick)
    }
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog" onkeydown={handleKeyDown}>
  <p>{prompt}</p>
  {#if choices.length > searchThreshold}
    <input
      use:focusSearch
      type="text"
      value={query !== null ? query : value}
      oninput={handleKeyPress}
    />
  {/if}
  <ul class="results" bind:this={listEl}>
    {#each results as result, i}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <li
        class:highlighted={highlighted === i}
        title={result.description}
        data-result-index={i}
        onclick={() => handleClickResult(result)}
        onmouseover={() => setHighlightPosition(i)}
      >
        {#if result.search && typeof (result.search as { highlight?: () => string }).highlight === 'function'}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html (result.search as { highlight: () => string }).highlight() || result[searchKey]}
        {:else}
          <span>{result[searchKey]}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if choices.length > searchThreshold}
    <div class="choices-counter">
      Total choices: {choices.length}.
      {#if enableShowAllButton}
        <button type="button" onclick={() => (showAll = true)}>Show all</button>
      {/if}
    </div>
  {/if}
</div>
