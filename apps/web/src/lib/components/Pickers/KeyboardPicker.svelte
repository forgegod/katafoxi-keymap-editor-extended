<script lang="ts">
  import * as config from '../../config'
  import { loadLayout } from '../../api'
  import { loadKeymap } from '../../api'
  import { compact } from '../../utils'
  import Selector from '../Common/Selector.svelte'
  import GithubPicker from './Github/Picker.svelte'

  interface KeymapEvent {
    source?: string
    layout?: unknown
    keymap?: unknown
    github?: { repository: string; branch: string }
    [key: string]: unknown
  }

  interface Props {
    onSelect: (event: KeymapEvent) => void
  }

  let { onSelect }: Props = $props()

  const sourceChoices = compact([
    config.enableLocal ? { id: 'local', name: 'Local' } : null,
    config.enableGitHub ? { id: 'github', name: 'GitHub' } : null
  ])

  const selectedSource = localStorage.getItem('selectedSource')
  const onlySource = sourceChoices.length === 1 ? sourceChoices[0].id : null
  const defaultSource =
    onlySource ||
    (sourceChoices.find(source => source.id === selectedSource)
      ? selectedSource
      : null)

  let source = $state<string | null>(defaultSource)

  function handleKeyboardSelected(event: KeymapEvent) {
    const { layout, keymap, ...rest } = event
    if (!keymap || typeof keymap !== 'object') return

    const km = keymap as {
      layer_names?: string[]
      layers: unknown[]
    }
    const layerNames =
      km.layer_names || km.layers.map((_, i) => `Layer ${i}`)
    Object.assign(km, { layer_names: layerNames })

    onSelect({ source: source ?? undefined, layout, keymap: km, ...rest })
  }

  async function fetchLocalKeyboard() {
    const [layout, keymap] = await Promise.all([loadLayout(), loadKeymap()])
    handleKeyboardSelected({ source: source ?? undefined, layout, keymap })
  }

  $effect(() => {
    const src = source
    if (src) localStorage.setItem('selectedSource', src)
    if (src === 'local') {
      fetchLocalKeyboard()
    }
  })
</script>

<div>
  <Selector
    id="source"
    label="Source"
    value={source}
    choices={sourceChoices}
    onUpdate={value => {
      source = String(value)
    }}
  />

  {#if source === 'github'}
    <GithubPicker onSelect={handleKeyboardSelected} />
  {/if}
</div>
