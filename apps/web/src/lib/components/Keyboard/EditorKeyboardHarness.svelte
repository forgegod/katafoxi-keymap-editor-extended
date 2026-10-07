<script lang="ts">
  import { editor } from '../../editor.svelte.js'
  import { setDefinitionsContext } from '../../context'
  import Keyboard from './Keyboard.svelte'

  setDefinitionsContext({
    get current() {
      return editor.definitions
    },
    set current(value) {
      editor.definitions = value
    }
  })
</script>

<p class="editor-status">{editor.statusText}</p>
<button
  type="button"
  class="undo"
  disabled={!editor.canUndo}
  onclick={() => editor.undo()}
>
  Undo
</button>

{#if editor.layout && editor.draftKeymap}
  <Keyboard
    layout={editor.layout}
    keymap={editor.draftKeymap}
    onUpdate={next => editor.updateKeymap(next)}
  />
{/if}
