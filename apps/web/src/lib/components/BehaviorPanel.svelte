<script lang="ts">
  import { onMount } from 'svelte'
  import { BEHAVIOR_DEFINITION_SCHEMAS, HOLD_TAP_FLAVORS, behaviorDeletePreflight, encodeKeyBinding, macroMetadataSignatures, parseDtsBehaviorDefinitions, parseKeyBinding, validateBehaviorInvocation, type ZmkBehaviorDefinition } from '@keymap-editor/keymap-core'
  import { buildMacroPreview, captureMacroDocument, confirmMacroPreview, type MacroDocument } from '../macro-editor'
  import { editor } from '../editor.svelte.js'
  import Button from './Common/Button.svelte'
  import Modal from './Common/Modal.svelte'
  import './MacroPanel.css'
  import './DefinitionDialog.css'

  let open = $state(false)
  let draft = $state<ZmkBehaviorDefinition | null>(null)
  let captured: MacroDocument | null = null
  let preview = $state.raw<ReturnType<typeof buildMacroPreview> | null>(null)
  let error = $state('')
  let editingCode = $state<string | null>(null)
  let values = $state<Record<string, string>>({})
  let using = $state<ZmkBehaviorDefinition | null>(null)
  let destination = $state('key')
  let layer = $state(0)
  let key = $state(0)
  let comboId = $state('')
  let args = $state<string[]>([])
  let replacement = $state('')
  const domains = $derived(macroMetadataSignatures(editor.draftKeymap?.macros, editor.draftKeymap?.layers.length ?? 0, editor.draftKeymap?.behaviorDefinitions).get(using?.code ?? '') ?? [])
  const schema = $derived(draft ? BEHAVIOR_DEFINITION_SCHEMAS[draft.compatible] : undefined)
  const sourceReadOnly = $derived.by(() => {
    if (editor.source === 'demo') return ''
    if (editor.source !== 'clipboard' || !editor.clipboardOriginalSource) return 'Authoring requires Demo or matching Clipboard source. Load the complete .keymap through Clipboard; GitHub/local and missing-source documents cannot author definitions here.'
    if (!parseDtsBehaviorDefinitions(editor.clipboardOriginalSource).referenceCoverageComplete) return 'Reference coverage is incomplete. Review unsupported source externally and reload; includes, defines and overrides are not expanded or repaired here.'
    return ''
  })
  const draftGuard = () => open && (draft || preview || using) ? 'behavior definition' : null
  onMount(() => editor.registerLayerOperationGuard(draftGuard))
  function start(existing?: ZmkBehaviorDefinition) {
    try {
      captured = captureMacroDocument(editor, draftGuard, 'Behavior')
      editingCode = existing?.code ?? null
      draft = existing ? structuredClone(existing) : { code: '&new_behavior', label: 'new_behavior', nodeName: 'new_behavior', compatible: 'zmk,behavior-tap-dance', cellProperty: '#binding-cells', arity: 0, bindings: ['&kp A'], properties: {}, editable: true, diagnostics: [] }
      values = Object.fromEntries(Object.entries(draft.properties).map(([name, value]) => [name, String(value)]))
      error = ''
    } catch (cause) { error = String(cause) }
  }
  function changeType(compatible: string) {
    const next = BEHAVIOR_DEFINITION_SCHEMAS[compatible]
    if (!draft || editingCode || !next) return
    draft = { ...draft, compatible, cellProperty: next.cellProperty, arity: next.arity, properties: {}, bindings: Array.from({ length: next.count || 1 }, () => next.bare ? '&kp' : '&kp A') }
    values = {}
  }
  function prepare() {
    if (!draft || !captured || !schema) return
    try {
      const properties: ZmkBehaviorDefinition['properties'] = {}
      for (const [name, kind] of Object.entries(schema.properties)) {
        const value = values[name] ?? ''
        if (value === '') {
          if (schema.required?.includes(name)) throw new Error(`${name} is required.`)
          continue
        }
        if (kind === 'uint') {
          if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 0xffffffff) throw new Error(`${name} requires a decimal integer from 0 to 4294967295; leave optional fields blank to keep them absent.`)
          properties[name] = Number(value)
        } else properties[name] = kind === 'flag' ? true : value
      }
      const definition = { ...$state.snapshot(draft), code: `&${draft.label}`, nodeName: editingCode ? draft.nodeName : draft.label, properties }
      if (editingCode && definition.code !== editingCode) {
        const current = buildMacroPreview(captured, captured.keymap)
        const check = behaviorDeletePreflight(current.definitionSource, editingCode)
        if (!check.ok) throw new Error(check.error)
      }
      const behaviorDefinitions = editingCode ? captured.keymap.behaviorDefinitions!.map(item => item.code === editingCode ? definition : item) : [...(captured.keymap.behaviorDefinitions ?? []), definition]
      preview = buildMacroPreview(captured, { ...captured.keymap, behaviorDefinitions })
      error = ''
    } catch (cause) { error = String(cause) }
  }
  function moveChild(index: number, delta: number) {
    if (!draft) return
    const bindings = [...draft.bindings]
    const [binding] = bindings.splice(index, 1)
    bindings.splice(index + delta, 0, binding)
    draft.bindings = bindings
  }
  function use(definition: ZmkBehaviorDefinition) {
    cancel()
    try {
      captured = captureMacroDocument(editor, draftGuard, 'Behavior')
      using = definition
      destination = definition.cellProperty === '#sensor-binding-cells' ? 'sensor' : 'key'; layer = 0; key = 0
      comboId = captured.keymap.combos?.[0]?.id ?? ''
      args = Array.from({ length: definition.arity }, () => '')
    } catch (cause) { error = String(cause) }
  }
  function prepareBinding() {
    if (!captured || !using) return
    try {
      const binding = [using.code, ...args].join(' ')
      const current = buildMacroPreview(captured, captured.keymap)
      const errors = validateBehaviorInvocation(current.definitionSource, binding, destination === 'sensor' ? 'sensor' : 'ordinary')
      if (errors.length) throw new Error(errors.join(' '))
      const before = destination === 'sensor' ? captured.keymap.sensorBindings?.[layer]?.[key] : destination === 'combo' ? captured.keymap.combos?.find(item => item.id === comboId)?.binding : captured.keymap.layers[layer]?.[key]
      if (!before) throw new Error('Choose an existing key, combo or encoder slot. Encoder hardware and new slots must be configured in source first.')
      const next = destination === 'sensor'
        ? { ...captured.keymap, sensorBindings: captured.keymap.sensorBindings!.map((row, l) => row.map((item, k) => l === layer && k === key ? parseKeyBinding(binding) : item)) }
        : destination === 'combo'
        ? { ...captured.keymap, combos: captured.keymap.combos!.map(item => item.id === comboId ? { ...item, binding: parseKeyBinding(binding) } : item) }
        : { ...captured.keymap, layers: captured.keymap.layers.map((row, l) => row.map((item, k) => l === layer && k === key ? parseKeyBinding(binding) : item)) }
      preview = buildMacroPreview(captured, next)
      replacement = `${encodeKeyBinding(before)} → ${binding}`
      error = ''
    } catch (cause) { error = String(cause) }
  }
  function remove(definition: ZmkBehaviorDefinition) {
    cancel()
    try {
      captured = captureMacroDocument(editor, draftGuard, 'Behavior')
      const current = buildMacroPreview(captured, captured.keymap)
      const check = behaviorDeletePreflight(current.definitionSource, definition.code)
      if (!check.ok) throw new Error(`${check.error} Remove the listed references first, or review unsupported source externally and reload. No callers are rewritten.`)
      preview = buildMacroPreview(captured, { ...captured.keymap, behaviorDefinitions: captured.keymap.behaviorDefinitions!.filter(item => item.code !== definition.code) })
      replacement = `Delete ${definition.code}. No incoming references in this document; references in other files are not proven.`
    } catch (cause) { error = String(cause) }
  }
  function cancel() { draft = null; preview = null; using = null; replacement = ''; error = '' }
  function confirm() {
    if (!captured || !preview) return
    try { confirmMacroPreview(editor, captured, preview); cancel() } catch (cause) { error = String(cause) }
  }
</script>

<Button onclick={() => open = true}>Behaviors</Button>
{#if open}
  <Modal ariaLabel="Behaviors" onBackdrop={() => { cancel(); open = false }}>
    <section class="macro-panel definition-dialog">
      <h2>Behaviors</h2>
      {#if sourceReadOnly}<p aria-label="Behavior authoring availability">Read-only: {sourceReadOnly}</p>{/if}
      <p>Global definition: changes affect every reference. Invocation arguments stay per key, combo or encoder.</p>
      {#if preview}
        <p aria-label="Binding replacement">{replacement || 'Review the source before applying the global definition.'}</p>
        <pre aria-label="Behavior source preview">{preview.code}</pre>
        <div class="definition-actions">
          <Button variant="accent" onclick={confirm}>Apply changes</Button>
          <Button onclick={cancel}>Cancel</Button>
        </div>
      {:else if using}
        <h3>Use {using.code}</h3>
        <div class="definition-group">
        <label>Destination <select aria-label="Behavior destination" value={destination} onchange={event => destination = event.currentTarget.value}>{#if using.cellProperty === '#sensor-binding-cells'}<option value="sensor">Existing encoder</option>{:else}<option value="key">Key</option><option value="combo" disabled={!editor.draftKeymap?.combos?.length}>Existing combo</option>{/if}</select></label>
        {#if destination === 'combo'}
          <label>Combo <select aria-label="Behavior target combo" value={comboId} onchange={event => comboId = event.currentTarget.value}>{#each editor.draftKeymap?.combos ?? [] as combo}<option value={combo.id}>{combo.id} · {encodeKeyBinding(combo.binding)}</option>{/each}</select></label>
        {:else}
          <label>Layer <select aria-label="Behavior target layer" value={layer} onchange={event => { layer = Number(event.currentTarget.value); key = 0 }}>{#each editor.draftKeymap?.layers ?? [] as _, index}<option value={index}>{index} · {editor.draftKeymap?.layer_names?.[index] ?? 'Layer'}</option>{/each}</select></label>
          {#if destination === 'sensor'}
            <label>Encoder slot <select aria-label="Behavior target encoder" value={key} onchange={event => key = Number(event.currentTarget.value)}>{#each editor.draftKeymap?.sensorBindings?.[layer] ?? [] as binding, index}<option value={index}>{index} · {encodeKeyBinding(binding)}</option>{/each}</select></label>
            <p>Replaces the whole adapter, not one turn. Child 1 is clockwise; child 2 is counter-clockwise. No hardware or encoder slots are created.</p>
          {:else}
            <label>Key position <select aria-label="Behavior target key" value={key} onchange={event => key = Number(event.currentTarget.value)}>{#each editor.draftKeymap?.layers[layer] ?? [] as binding, index}<option value={index}>{index} · {encodeKeyBinding(binding)}</option>{/each}</select></label>
          {/if}
        {/if}
        {#each args as arg, index}<label>Argument {index + 1} · {domains[index] ?? 'unproven'} <input aria-label={`Behavior argument ${index + 1}`} value={arg} oninput={event => args[index] = event.currentTarget.value} /></label>{/each}
        </div>
        <div class="definition-actions">
          <Button onclick={prepareBinding}>Preview binding</Button>
          <Button onclick={cancel}>Cancel</Button>
        </div>
      {:else if draft}
        <div class="definition-group">
        <label>Behavior label <input aria-label="Behavior label" value={draft.label} oninput={event => { if (draft) draft.label = event.currentTarget.value }} /></label>
        <label>Behavior type <select aria-label="Behavior type" value={draft.compatible} disabled={editingCode !== null} onchange={event => changeType(event.currentTarget.value)}>{#each Object.keys(BEHAVIOR_DEFINITION_SCHEMAS) as compatible}<option value={compatible}>{compatible.replace('zmk,behavior-', '')}</option>{/each}</select></label>
        <p>Node: {editingCode ? draft.nodeName : draft.label} · {draft.cellProperty}: {draft.arity}. Existing type, node name and cell count stay fixed.</p>
        </div>
        {#if schema?.bare}<p>Bare child references forward invocation arguments; do not add argument cells here. Sticky-layer uses sticky-key with a layer child such as &amp;mo.</p>{:else}<p>Child bindings are complete invocations, including required arguments.</p>{/if}
        {#each draft.bindings as binding, index}
          <div class="definition-group">
          <label>Child {index + 1} binding <input aria-label={`Child ${index + 1} binding`} value={binding} oninput={event => { if (draft) draft.bindings[index] = event.currentTarget.value }} /></label>
          {#if schema?.count === 0}
            <div class="definition-actions">
              <Button aria-label={`Move child ${index + 1} up`} disabled={index === 0} onclick={() => moveChild(index, -1)}>Up</Button>
              <Button aria-label={`Move child ${index + 1} down`} disabled={index === draft.bindings.length - 1} onclick={() => moveChild(index, 1)}>Down</Button>
              <Button variant="danger" aria-label={`Remove child ${index + 1}`} disabled={draft.bindings.length === 1} onclick={() => { if (draft) draft.bindings = draft.bindings.filter((_, i) => i !== index) }}>Remove</Button>
            </div>
          {/if}
          </div>
        {/each}
        {#if schema?.count === 0}<div class="definition-actions"><Button onclick={() => draft?.bindings.push('&kp A')}>Add child</Button></div>{/if}
        <div class="definition-group">
        {#each Object.entries(schema?.properties ?? {}) as [name, kind]}
          {#if kind === 'flag'}
            <label class="definition-check"><input type="checkbox" aria-label={name} checked={values[name] === 'true'} onchange={event => values[name] = event.currentTarget.checked ? 'true' : ''} /> {name}</label>
          {:else if kind === 'flavor'}
            <label>{name} <select aria-label={name} value={values[name] ?? ''} onchange={event => values[name] = event.currentTarget.value}><option value="">Absent (firmware default)</option>{#each HOLD_TAP_FLAVORS as flavor}<option value={flavor.id}>{flavor.id}</option>{/each}</select></label>
          {:else}
            <label>{name} {schema?.required?.includes(name) ? '(required)' : '(optional)'} <input aria-label={name} inputmode="numeric" value={values[name] ?? ''} oninput={event => values[name] = event.currentTarget.value} placeholder="Decimal uint32; blank leaves absent" /></label>
          {/if}
        {/each}
        </div>
        <div class="definition-actions">
          <Button onclick={prepare}>Preview changes</Button>
          <Button onclick={cancel}>Cancel</Button>
        </div>
      {:else}
        {#each editor.draftKeymap?.behaviorDefinitions ?? [] as definition}<div class="definition-group">
          <p><code>{definition.code}</code> · {definition.compatible}</p>
          <div class="definition-actions">
            <Button aria-label={`Edit ${definition.code}`} disabled={!!sourceReadOnly || !definition.editable} onclick={() => start(definition)}>Edit</Button>
            <Button aria-label={`Use ${definition.code}`} disabled={!!sourceReadOnly || !definition.editable} onclick={() => use(definition)}>Use</Button>
            <Button variant="danger" aria-label={`Delete ${definition.code}`} disabled={!!sourceReadOnly} onclick={() => remove(definition)}>Delete</Button>
          </div>
        {#if !definition.editable}<p aria-label={`Behavior diagnostics ${definition.code}`}>Read-only: {definition.diagnostics.join('; ')}. Review unsupported source externally and reload; it is preserved, never converted to a supported schema.</p>{/if}
        </div>{/each}
        <div class="definition-actions">
          <Button disabled={!!sourceReadOnly} onclick={() => start()}>New behavior</Button>
          <Button onclick={() => open = false}>Close</Button>
        </div>
      {/if}
      {#if error}<p role="alert">{error}</p>{/if}
    </section>
  </Modal>
{/if}
