<script lang="ts">
  export interface Choice {
    id: string | number
    /** Closed control and menu label. */
    name: string
    /** Hover text, such as owner/repo when `name` is only the repo. */
    title?: string
  }

  interface Props {
    id: string
    label: string
    value: string | number | null | undefined
    choices: Choice[]
    onUpdate: (id: string | number) => void
  }

  let { id, label, value, choices, onUpdate }: Props = $props()

  const selected = $derived(choices.find(choice => choice.id === value))

  function indexOf(v: string | number | null | undefined): string | number {
    const result = choices.findIndex(choice => choice.id === v)
    return result === -1 ? '' : result
  }

  function handleSelect(e: Event) {
    const target = e.target as HTMLSelectElement
    const index = Number(target.value)
    const choice = choices[index]?.id
    if (choice !== undefined) onUpdate(choice)
  }
</script>

<div class="selector">
  <label for={id}>{label}</label>
  <div class="control">
    <span class="sizer" aria-hidden="true">{selected?.name ?? label}</span>
    <select
      {id}
      onchange={handleSelect}
      value={indexOf(value)}
      title={selected?.title || selected?.name}
    >
      {#each choices as choice, i}
        <option value={i} title={choice.title}>{choice.name}</option>
      {/each}
    </select>
  </div>
</div>

<style>
  .selector {
    display: inline-flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1px;
    margin: 0;
    width: auto;
  }

  label {
    font-size: var(--font-sm);
    line-height: 1.15;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .control {
    position: relative;
    display: inline-block;
    width: max-content;
    max-width: 16rem;
  }

  .sizer {
    visibility: hidden;
    display: block;
    white-space: nowrap;
    box-sizing: border-box;
    height: var(--chrome-h);
    min-height: var(--chrome-h);
    padding: 0 1.5rem 0 6px;
    border: 1px solid transparent;
    font-family: Quicksand, avenir, sans-serif;
    font-size: var(--font-md);
    font-weight: 500;
    line-height: calc(var(--chrome-h) - 2px);
  }

  :global(#app-root) .control select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-width: 0;
    max-width: none;
    font-size: var(--font-md);
    line-height: calc(var(--chrome-h) - 2px);
    appearance: none;
    padding-right: 1.5rem;
    background-color: var(--surface);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%23555' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' d='M1 1.5 6 6.5 11 1.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    background-size: 10px 7px;
  }
</style>
