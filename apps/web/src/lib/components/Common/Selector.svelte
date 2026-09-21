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

<div style="display:inline-block;width:auto;margin:5px;">
  <label for={id} style="display:block;width:100%;font-size:120%;color:#555;">
    {label}
  </label>
  <select {id} onchange={handleSelect} value={indexOf(value)}>
    {#each choices as choice, i}
      <option value={i}>{choice.name}</option>
    {/each}
  </select>
</div>
