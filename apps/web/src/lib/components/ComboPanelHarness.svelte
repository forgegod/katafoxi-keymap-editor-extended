<script lang="ts">
  import { editor } from '../editor.svelte.js'
  import { setDefinitionsContext, setSearchContext } from '../context'
  import ComboPanel from './ComboPanel.svelte'

  setDefinitionsContext({
    get current() {
      return editor.definitions
    },
    set current(value) {
      editor.definitions = value
    }
  })
  setSearchContext({
    get current() {
      return {
        getSearchTargets: () => [],
        sources: {}
      }
    },
    set current(_value) {}
  })
</script>

<ComboPanel />
