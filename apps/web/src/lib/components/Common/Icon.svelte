<script lang="ts">
  const faCollections: Record<string, string> = {
    brands: 'fab',
    default: 'fa'
  }

  interface Props {
    name: string
    class?: string
    collection?: string
    onclick?: (event: MouseEvent) => void
    title?: string
  }

  let {
    name,
    class: className = '',
    collection = 'default',
    onclick,
    title
  }: Props = $props()

  const groupClass = $derived(faCollections[collection] || faCollections.default)
  const iconClass = $derived(`fa-${name}`)
</script>

<span
  class="{className} {groupClass} {iconClass}"
  {onclick}
  {title}
  role={onclick ? 'button' : undefined}
></span>
