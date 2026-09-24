<script lang="ts">
  export interface Choice {
    id: string | number
    name: string
  }

  interface Props {
    id: string
    label: string
    value: string | number | null | undefined
    choices: Choice[]
    onUpdate: (id: string | number) => void
  }

  let { id, label, value, choices, onUpdate }: Props = $props()

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
  <select {id} onchange={handleSelect} value={indexOf(value)}>
    {#each choices as choice, i}
      <option value={i}>{choice.name}</option>
    {/each}
  </select>
</div>

<style>
  .selector {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 5px;
    width: auto;
  }

  label {
    font-size: 100%;
    color: #555;
    white-space: nowrap;
  }
</style>
