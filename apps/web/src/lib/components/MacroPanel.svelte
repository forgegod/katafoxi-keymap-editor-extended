<script lang="ts">
  import { onMount } from 'svelte'
  import { encodeKeyBinding, macroDeletePreflight, macroMetadataSignatures, macroQueueWarnings, parseKeyBinding, textToUsAsciiMacro, validateMacroInvocation, type ZmkMacroDefinition, type ZmkMacroStep } from '@keymap-editor/keymap-core'
  import { buildMacroPreview, captureMacroDocument, confirmMacroPreview, type MacroDocument } from '../macro-editor'
  import { editor } from '../editor.svelte.js'
  import Button from './Common/Button.svelte'
  import Modal from './Common/Modal.svelte'
  import './MacroPanel.css'

  let open = $state(false)
  let draft = $state<ZmkMacroDefinition | null>(null)
  let captured: MacroDocument | null = null
  let preview = $state.raw<ReturnType<typeof buildMacroPreview> | null>(null)
  let error = $state('')
  let editingCode = $state<string | null>(null)
  let tapMs = $state('')
  let waitMs = $state('')
  let using = $state<ZmkMacroDefinition | null>(null)
  let layer = $state(0)
  let key = $state(0)
  let args = $state<string[]>([])
  let destination = $state('key')
  let comboId = $state('')
  const domains = $derived(macroMetadataSignatures(editor.draftKeymap?.macros, editor.draftKeymap?.layers.length ?? 0).get(using?.code ?? '') ?? [])
  let replacement = $state('')
  let textDialog = $state(false)
  let text = $state('')
  let acknowledged = $state(false)
  let pasteError = $state('')
  const generated = $derived(textToUsAsciiMacro(text))
  const warnings = $derived.by(() => {
    try { return draft ? macroQueueWarnings(draft.steps) : [] } catch { return ['Finish the binding syntax to compute queue warnings.'] }
  })
  const draftGuard = () => open && (draft || using || preview || textDialog) ? 'macro' : null
  onMount(() => editor.registerLayerOperationGuard(draftGuard))
  function pasteText(event: ClipboardEvent) {
    event.preventDefault()
    const field = event.currentTarget as HTMLTextAreaElement
    const next = text.slice(0, field.selectionStart) + (event.clipboardData?.getData('text/plain') ?? '') + text.slice(field.selectionEnd)
    const result = textToUsAsciiMacro(next)
    pasteError = result.ok ? '' : `Paste rejected: ${result.errors.join(' ')}`
    if (result.ok) text = next
  }
  function generate() {
    if (pasteError || !acknowledged || !generated.ok || !generated.changed) return
    start()
    if (!draft) return
    draft.steps = generated.steps
    draft.arity = 0
    tapMs = String(generated.tapMs)
    waitMs = String(generated.waitMs)
    textDialog = false
  }
  const controls = ['tap', 'press', 'release', 'tap_time', 'wait_time', 'pause_for_release', 'param_1to1', 'param_1to2', 'param_2to1', 'param_2to2']
  function start(existing?: ZmkMacroDefinition) {
    try { captured = captureMacroDocument(editor, draftGuard) } catch (cause) { error = String(cause); return }
    editingCode = existing?.code ?? null
    draft = existing ? structuredClone(existing) : { code: '&new_macro', label: 'new_macro', nodeName: 'new_macro', container: 'macros', arity: 0, editable: true, diagnostics: [], steps: [{ kind: 'behavior', binding: '&kp A' }] }
    tapMs = existing?.tapMs?.toString() ?? ''
    waitMs = existing?.waitMs?.toString() ?? ''
    preview = null
    error = ''
  }
  function timing(value: string): number | undefined {
    if (value === '') return undefined
    if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 0xffffffff) throw new Error('Timing must be a decimal integer from 0 to 4294967295, or blank for the firmware default.')
    return Number(value)
  }
  function setStep(index: number, step: ZmkMacroStep) {
    if (draft) draft.steps[index] = step
  }
  function stepType(index: number, type: string) {
    setStep(index, type === 'behavior' ? { kind: 'behavior', binding: '&kp A' } : { kind: 'control', control: type, values: type.endsWith('_time') ? ['0'] : [] })
  }
  function move(index: number, delta: number) {
    if (!draft) return
    const steps = [...draft.steps]
    const [step] = steps.splice(index, 1)
    steps.splice(index + delta, 0, step)
    draft.steps = steps
  }
  function prepare() {
    if (!draft || !captured || !editor.layout) return
    try {
      const definition = { ...$state.snapshot(draft), code: `&${draft.label}`, nodeName: editingCode ? draft.nodeName : draft.label, tapMs: timing(tapMs), waitMs: timing(waitMs) }
      if (editingCode && definition.code !== editingCode) {
        const current = buildMacroPreview(captured, captured.keymap)
        const check = macroDeletePreflight(current.definitionSource, editingCode)
        if (!check.ok) throw new Error(`${check.error} ${check.sites.map(site => site.path).join(', ')}`)
      }
      const macros = editingCode ? captured.keymap.macros!.map(item => item.code === editingCode ? definition : item) : [...(captured.keymap.macros ?? []), definition]
      preview = buildMacroPreview(captured, { ...captured.keymap, macros })
      error = ''
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause) }
  }
  function confirm() {
    if (!preview || !captured) return
    try { confirmMacroPreview(editor, captured, preview) } catch (cause) { error = String(cause); return }
    cancel()
  }
  function cancel() {
    draft = null
    preview = null
    using = null
    replacement = ''
    error = ''
    textDialog = false
  }
  function remove(macro: ZmkMacroDefinition) {
    cancel()
    try {
      captured = captureMacroDocument(editor, draftGuard)
      const current = buildMacroPreview(captured, captured.keymap)
      const check = macroDeletePreflight(current.definitionSource, macro.code)
      if (!check.ok) throw new Error(`${check.error} ${check.sites.map(site => site.path).join(', ')}`)
      preview = buildMacroPreview(captured, { ...captured.keymap, macros: captured.keymap.macros!.filter(item => item.code !== macro.code) })
      replacement = `Delete ${macro.code}. No incoming references in this document. This does not prove references in other files.`
    } catch (cause) { error = String(cause) }
  }
  function use(macro: ZmkMacroDefinition) {
    cancel()
    try { captured = captureMacroDocument(editor, draftGuard) } catch (cause) { error = String(cause); return }
    using = macro
    layer = 0; key = 0; args = Array.from({ length: macro.arity }, () => '')
    destination = 'key'; comboId = editor.draftKeymap?.combos?.[0]?.id ?? ''
  }
  function prepareBinding() {
    if (!captured || !using) return
    try {
      const binding = [using.code, ...args].join(' ')
      const current = buildMacroPreview(captured, captured.keymap)
      const errors = validateMacroInvocation(current.definitionSource, binding)
      if (errors.length) throw new Error(errors.join(' '))
      const before = destination === 'combo' ? captured.keymap.combos?.find(item => item.id === comboId)?.binding : captured.keymap.layers[layer]?.[key]
      if (!before) throw new Error('Choose an existing key or combo.')
      const next = destination === 'combo'
        ? { ...captured.keymap, combos: captured.keymap.combos!.map(item => item.id === comboId ? { ...item, binding: parseKeyBinding(binding) } : item) }
        : { ...captured.keymap, layers: captured.keymap.layers.map((row, l) => row.map((item, k) => l === layer && k === key ? parseKeyBinding(binding) : item)) }
      preview = buildMacroPreview(captured, next)
      replacement = `${encodeKeyBinding(before)} → ${binding}`
      error = ''
    } catch (cause) { error = String(cause) }
  }
</script>

<Button onclick={() => open = true}>Macros</Button>
{#if open}
  <Modal ariaLabel={textDialog ? 'Text to sequence' : 'Macros'} onBackdrop={() => { cancel(); open = false }}>
    <section class="macro-panel">
      <h2>Macros</h2>
      {#if textDialog}
        <h3>Text to sequence</h3>
        <p>Create a new zero-parameter tap sequence, never append to an existing press/release state. The active Host language is not used.</p>
        <label>Text <textarea aria-label="Macro text" bind:value={text} oninput={() => pasteError = ''} onpaste={pasteText} rows="4"></textarea></label>
        <label><input type="checkbox" aria-label="Use US QWERTY / ASCII mapping" bind:checked={acknowledged} /> Use US QWERTY / ASCII mapping</label>
        <p>Printable ASCII, LF and TAB only; no Unicode fallback.</p>
        {#if pasteError}<p role="alert">{pasteError}</p>{/if}
        {#if !generated.ok}
          <p role="alert">{generated.errors.join(' ')}</p>
        {:else if generated.changed}
          <pre aria-label="Generated sequence">{generated.steps.map(step => step.kind === 'behavior' ? step.binding : '').join('\n')}</pre>
          {#each generated.warnings as warning}<p>{warning}</p>{/each}
        {:else}<p>Enter text to preview. Empty text makes no change.</p>{/if}
        <button disabled={!!pasteError || !acknowledged || !generated.ok || !generated.changed} onclick={generate}>Use generated sequence</button>
        <button onclick={cancel}>Cancel</button>
      {:else if preview}
        <p aria-label="Binding replacement">{replacement || 'Review the resulting source. Confirm replaces the staged definition; Cancel keeps the document unchanged.'}</p>
        <pre aria-label="Macro source preview">{preview.code}</pre>
        <button onclick={confirm}>Confirm changes</button>
        <button onclick={cancel}>Cancel</button>
      {:else if using}
        <h3>Use {using.code}</h3>
        <label>Destination <select aria-label="Macro destination" value={destination} onchange={event => destination = event.currentTarget.value}><option value="key">Key</option><option value="combo" disabled={!editor.draftKeymap?.combos?.length}>Existing combo</option></select></label>
        {#if destination === 'combo'}
        <label>Combo <select aria-label="Macro target combo" value={comboId} onchange={event => comboId = event.currentTarget.value}>{#each editor.draftKeymap?.combos ?? [] as combo}<option value={combo.id}>{combo.id} · {encodeKeyBinding(combo.binding)}</option>{/each}</select></label>
        {:else}
        <label>Layer <select aria-label="Macro target layer" value={layer} onchange={event => { layer = Number(event.currentTarget.value); key = 0 }}>{#each editor.draftKeymap?.layers ?? [] as _, index}<option value={index}>{index} · {editor.draftKeymap?.layer_names?.[index] ?? 'Layer'}</option>{/each}</select></label>
        <label>Key position <select aria-label="Macro target key" value={key} onchange={event => key = Number(event.currentTarget.value)}>{#each editor.draftKeymap?.layers[layer] ?? [] as binding, index}<option value={index}>{index} · {encodeKeyBinding(binding)}</option>{/each}</select></label>
        {/if}
        {#each args as arg, index}<label>Argument {index + 1} · {domains[index] ?? 'unproven'} <input aria-label={`Macro argument ${index + 1}`} value={arg} oninput={event => args[index] = event.currentTarget.value} /></label>{/each}
        <button onclick={prepareBinding}>Preview binding</button>
        <button onclick={cancel}>Cancel</button>
      {:else if draft}
          <label>Macro label <input aria-label="Macro label" value={draft.label} oninput={event => { if (draft) draft.label = event.currentTarget.value }} /></label>
          <label>Display name <input aria-label="Display name" value={draft.displayName ?? ''} oninput={event => { if (draft) draft.displayName = event.currentTarget.value || undefined }} /></label>
          <label>Parameter count <select aria-label="Parameter count" value={draft.arity} disabled={editingCode !== null} onchange={event => { if (draft) draft.arity = Number(event.currentTarget.value) as 0 | 1 | 2 }}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></label>
          <p>Existing parameter counts stay fixed. Forward each input to the next behavior using a parameter control and MACRO_PLACEHOLDER. Types are inferred by core from all uses.</p>
          <label>Tap time (ms) <input aria-label="Tap time (ms)" inputmode="numeric" bind:value={tapMs} placeholder="Firmware default" /></label>
          <label>Wait time (ms) <input aria-label="Wait time (ms)" inputmode="numeric" bind:value={waitMs} placeholder="Firmware default" /></label>
          <h3>Sequence</h3>
          <p>Wait time sets the delay after subsequent events; it is not a standalone sleep.</p>
          {#each draft.steps as step, index}
            <div class="macro-step">
              <label>Step {index + 1} <select aria-label={`Step ${index + 1} type`} value={step.kind === 'behavior' ? 'behavior' : step.control} onchange={event => stepType(index, event.currentTarget.value)}><option value="behavior">Behavior binding</option>{#each controls as control}<option value={control}>{control}</option>{/each}</select></label>
              {#if step.kind === 'behavior'}
                <input aria-label={`Step ${index + 1} binding`} value={step.binding} oninput={event => setStep(index, { kind: 'behavior', binding: event.currentTarget.value })} />
              {:else if step.control.endsWith('_time')}
                <input aria-label={`Step ${index + 1} milliseconds`} inputmode="numeric" value={step.values[0]} oninput={event => setStep(index, { ...step, values: [event.currentTarget.value] })} />
              {/if}
              <button aria-label={`Move step ${index + 1} up`} disabled={index === 0} onclick={() => move(index, -1)}>Up</button>
              <button aria-label={`Move step ${index + 1} down`} disabled={index === draft.steps.length - 1} onclick={() => move(index, 1)}>Down</button>
              <button aria-label={`Remove step ${index + 1}`} onclick={() => { if (draft) draft.steps = draft.steps.filter((_, i) => i !== index) }}>Remove</button>
            </div>
          {/each}
          <button disabled={draft.steps.length >= 256} onclick={() => { draft?.steps.push({ kind: 'behavior', binding: '&kp A' }) }}>Add step</button>
          <button onclick={prepare}>Preview changes</button>
        <button onclick={cancel}>Cancel</button>
      {:else}
        {#each editor.draftKeymap?.macros ?? [] as macro}<div class="macro-list-item"><p>{macro.code} {macro.displayName ?? ''}
          <button aria-label={`Edit ${macro.code}`} disabled={!macro.editable} onclick={() => start(macro)}>Edit</button>
          <button aria-label={`Use ${macro.code}`} disabled={!macro.editable} onclick={() => use(macro)}>Use</button>
          <button aria-label={`Delete ${macro.code}`} onclick={() => remove(macro)}>Delete</button>
        </p>
        {#if !macro.editable}<p aria-label={`Macro diagnostics ${macro.code}`}>Read-only: {macro.diagnostics.join('; ')}</p>{/if}
        </div>{/each}
        <button onclick={() => start()}>New macro</button>
        <button onclick={() => { text = ''; pasteError = ''; acknowledged = false; textDialog = true }}>Text to sequence</button>
        <button onclick={() => open = false}>Close</button>
      {/if}
      {#if error}<p role="alert">{error}</p>{/if}
      {#if warnings.length}<div aria-label="Macro warnings" role="status">{#each warnings as warning}<p>{warning}</p>{/each}</div>{/if}
    </section>
  </Modal>
{/if}
