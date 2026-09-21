<script lang="ts">
  import type { Snippet } from 'svelte'
  import { setDefinitionsContext, type Definitions } from '../context'

  interface Props {
    definitions: Definitions
    children: Snippet
  }

  let { definitions, children }: Props = $props()

  setDefinitionsContext(definitions)
</script>

{@render children()}
