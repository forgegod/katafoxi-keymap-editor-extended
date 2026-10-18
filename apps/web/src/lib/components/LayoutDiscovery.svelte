<script lang="ts">
  import { buildLayoutCatalog, type LayoutCatalog, type CatalogLayoutResult } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte'
  import { captureLayoutDocument, previewLayout, acceptLayout, exportLayout, type LayoutDocument } from '../layout-discovery'
  import { downloadText } from '../download'
  import Button from './Common/Button.svelte'
  import Modal from './Common/Modal.svelte'
  import './LayoutDiscovery.css'

  let open = $state(false)
  let document: LayoutDocument | null = $state.raw(null)
  let catalog: LayoutCatalog | null = $state.raw(null)
  let result: CatalogLayoutResult | null = $state.raw(null)
  let catalogText = $state('')
  let entryId = $state('')
  let kind = $state<'automatic' | 'transform' | 'physical'>('automatic')
  let label = $state('')
  let acknowledged = $state(false)
  let busy = $state(false)
  let error = $state('')
  let note = $state('')
  let generation = 0
  const entry = $derived.by(() => catalog?.entries.find(item => item.id === entryId))
  const message = (err: unknown) => err instanceof Error ? err.message : 'Invalid metadata catalog'

  function invalidate() { result = null; acknowledged = false; error = ''; note = '' }
  function selectEntry(event: Event) {
    entryId = (event.currentTarget as HTMLSelectElement).value
    invalidate()
  }
  function close() { generation++; open = false; busy = false; document = null; catalog = null; result = null }
  function begin() {
    catalogText = ''; entryId = ''; label = ''; kind = 'automatic'; catalog = null; invalidate()
    open = true
    try { document = captureLayoutDocument(editor) } catch (err) { document = null; error = message(err) }
  }
  async function loadCatalog() {
    const request = ++generation
    invalidate(); catalog = null; entryId = ''; busy = true
    try {
      // This is a supplied offline artifact, not a URL or an include resolver.
      if (new TextEncoder().encode(catalogText).length > 2 * 1024 * 1024) throw new Error('Catalog exceeds the 2 MiB import limit')
      const input = JSON.parse(catalogText)
      if (!input || typeof input.version !== 'string' || !Array.isArray(input.entries)) throw new Error('Catalog JSON requires version and entries')
      const built = await buildLayoutCatalog(input.version, input.entries)
      if (request === generation && open) catalog = built
    } catch (err) {
      if (request === generation) error = `Invalid catalog: ${message(err)}. Keep the current board or supply explicit layout JSON.`
    } finally { if (request === generation) busy = false }
  }
  function preview() {
    invalidate()
    if (!document || !catalog) return
    try {
      if (kind !== 'automatic' && !label.trim()) throw new Error('Enter an exact candidate label from the metadata')
      result = previewLayout(document, catalog, entryId, kind === 'automatic' ? undefined : { kind, label: label.trim() })
    } catch (err) { error = message(err) }
  }
  function accept() {
    if (!document || !result) return
    try { acceptLayout(editor, document, result, acknowledged); close() } catch (err) { error = message(err) }
  }
  function exportJson() {
    if (!document || !result) return
    try {
      downloadText(exportLayout(editor, document, result), 'discovered-layout.json')
      note = 'Layout JSON exported separately. No firmware, host or repository files written; the preview is not accepted.'
    } catch (err) { error = message(err) }
  }
</script>

{#if editor.source === 'clipboard' || editor.source === 'github'}
  <Button variant="outline" onclick={begin}>Layout discovery</Button>
{/if}
{#if open}
  <Modal size="wide" ariaLabel="Layout discovery" onBackdrop={close}>
    <section class="layout-discovery">
      <h2>Layout discovery</h2>
      <p>Supplied layout JSON wins. Without it, the current binding-count rectangle stays editable until you explicitly accept a validated preview. A rectangle is not physical geometry.</p>
      <p>No keyboard inventory is bundled. Paste a reviewed, versioned catalog artifact (version + entries) with resolved literal metadata, source URL/commit/path, license and notice. This does not fetch includes or verify the curator's claims.</p>
      {#if document}
        <p class="layout-provenance">Document: {document.source.id}<br>Source revision: {document.source.revision}</p>
        <label>Catalog JSON
          <textarea rows="5" spellcheck="false" bind:value={catalogText} oninput={() => { generation++; busy = false; catalog = null; invalidate() }}></textarea>
        </label>
        <Button disabled={busy || !catalogText.trim()} onclick={() => void loadCatalog()}>{busy ? 'Validating…' : 'Load catalog'}</Button>
        {#if catalog}
          <label>Board / shield / revision
            <select value={entryId} onchange={selectEntry}>
              <option value="">Unknown / not listed</option>
              {#each catalog.entries as item}
                <option value={item.id}>{item.board} / {item.shield ?? 'no shield'} / {item.revision}{item.part ? ` / ${item.part}` : ''} · {item.id}</option>
              {/each}
            </select>
          </label>
          <p class="layout-provenance">Catalog revision: {catalog.revision}</p>
          {#if entry}
            <p class="layout-provenance">Source: {entry.attribution.url}<br>Commit: {entry.attribution.commit}<br>Path: {entry.attribution.path}<br>License: {entry.attribution.license} · {entry.attribution.notice}<br>Metadata SHA-256: {entry.sourceSha256}</p>
            <details><summary>Resolved metadata and candidate labels</summary><pre>{entry.metadata ?? 'No metadata supplied'}</pre></details>
          {/if}
          <div class="layout-choice">
            <label>Candidate type
              <select bind:value={kind} onchange={invalidate}>
                <option value="automatic">Firmware chosen / sole eligible candidate</option>
                <option value="transform">Transform</option>
                <option value="physical">Physical layout</option>
              </select>
            </label>
            {#if kind !== 'automatic'}
              <label>Candidate label<input bind:value={label} oninput={invalidate} placeholder="Exact DTS label" /></label>
            {/if}
          </div>
          <Button onclick={preview}>Preview layout</Button>
        {/if}
        {#if result?.status === 'unavailable'}
          <p role="status">Discovery unavailable ({result.reason}): {result.message} Current board and firmware are unchanged; keep the binding-count rectangle or supply explicit layout JSON.</p>
          {#if result.reason === 'ambiguous'}<p>Inspect the resolved metadata above, select a candidate type and enter its exact label. A preview choice cannot override firmware chosen declarations.</p>{/if}
        {:else if result?.status === 'candidate'}
          <h3>{result.layout.geometry === 'electrical-inference' ? 'Inferred electrical arrangement — not measured physical geometry' : 'Source-declared geometry — not independently measured'}</h3>
          <p>Transform: {result.layout.transform} · {result.layout.compatible}{result.layout.physicalLayout ? ` · Physical layout: ${result.layout.physicalLayout}` : ''}<br>Offsets: {result.layout.offset.join(', ')} · {result.layout.layout.length} bindings in original order<br>Sensors: {result.layout.sensorLabels?.join(', ') ?? 'association unverified; firmware slots retained'}</p>
          <div class="layout-map" role="img" aria-label="Candidate layout in binding order">
            {#each result.layout.layout as key, index}
              <span style:left={`${key.x * 32}px`} style:top={`${key.y * 32}px`} title={`Binding ${index}: electrical ${result.layout.positions[index].join(', ')}`}>{index}</span>
            {/each}
          </div>
          <p>Scheme uses serialization slots, not electrical coordinates. Accept changes session geometry only, not bindings, chosen properties or files. Export is a separate download; reload requires a new preview or explicit layout JSON.</p>
          <label class="layout-ack"><input type="checkbox" bind:checked={acknowledged} />I acknowledge unverified firmware compatibility and trust this catalog provenance</label>
          <div class="layout-actions">
            <Button variant="accent" disabled={!acknowledged} onclick={accept}>Accept layout</Button>
            <Button onclick={exportJson}>Export layout JSON</Button>
          </div>
        {/if}
      {/if}
      {#if error}<p role="alert">{error}</p>{/if}
      {#if note}<p role="status">{note}</p>{/if}
      <Button onclick={close}>Cancel</Button>
    </section>
  </Modal>
{/if}
