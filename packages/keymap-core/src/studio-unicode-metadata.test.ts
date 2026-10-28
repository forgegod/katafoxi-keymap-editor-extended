import { describe, expect, it } from 'vitest'
import * as core from './index.js'

// Synthetic decoded getBehaviorDetails responses, not hardware captures.
// Firmware .parameter_metadata is exposed as metadata by the Studio RPC client.
function detailsFixture(metadata: core.StudioBehaviorDetails['metadata'] = [{
  param1: [{ name: 'Unicode', range: { min: 0, max: 0x10ffff } }],
  param2: [{ name: 'Shift Unicode', range: { min: 0, max: 0x10ffff } }]
}]) {
  return { requestId: 3, behaviors: { getBehaviorDetails: {
    id: 37, displayName: 'Not a devicetree alias', metadata
  } } } satisfies core.StudioRpcSessionResponses['getBehaviorDetails'][number]
}

function expanded(source: string): core.StudioBehaviorBinding {
  const cells = core.expandStudioUnicodeBinding(core.parseKeyBinding(source))
  if (!cells) throw new Error(`Invalid test binding: ${source}`)
  return { behaviorId: 37, ...cells }
}

function modeSet(): core.StudioBehaviorDetails['metadata'][number] {
  return {
    param1: [{ name: 'Select input mode', constant: 0xffffff }],
    param2: [{ name: 'Input mode', range: { min: 0, max: 5 } }]
  }
}

const missingSet = {
  status: 'refused', reason: 'missing-unicode-parameter-set',
  path: 'getBehaviorDetails.behaviors.getBehaviorDetails.metadata'
}

describe('validateStudioUnicodeMetadata', () => {
  it('accepts an expanded alias when one advertised numeric set accepts both cells', () => {
    expect(core).toHaveProperty('validateStudioUnicodeMetadata')
    const response = detailsFixture()
    const binding = expanded('&uc UC_DE_AE')
    const before = structuredClone({ response, binding })
    expect(core.validateStudioUnicodeMetadata(response, binding)).toEqual({ status: 'accepted' })
    expect({ response, binding }).toEqual(before)
  })

  it.each(['&uc 0xE4 0xC4', '&uc 0xE4 0', '&uc 0 0', '&uc 0xD7FF 0xE000', '&uc 0x10000 0x10FFFF'])(
    'accepts numeric scalars and zero without inferring Shift: %s', source => {
      expect(core.validateStudioUnicodeMetadata(detailsFixture(), expanded(source))).toEqual({ status: 'accepted' })
    }
  )

  it.each([
    ['UC_SET_MACOS', 0], ['UC_SET_LINUX', 1], ['UC_SET_LINUX_ALT', 2],
    ['UC_SET_WIN_COMPOSE', 3], ['UC_SET_WIN_ALT', 4], ['UC_SET_EMACS', 5]
  ])('accepts %s only with an advertised set for sentinel plus mode %s', (alias, index) => {
    const binding = expanded(`&uc ${alias}`)
    expect(binding).toEqual({ behaviorId: 37, param1: 0xffffff, param2: index })
    expect(core.validateStudioUnicodeMetadata(detailsFixture([modeSet()]), binding)).toEqual({ status: 'accepted' })
    expect(core.validateStudioUnicodeMetadata(detailsFixture(), binding)).toEqual(missingSet)
  })

  it('accepts exact constants, including explicit zero, in either order of advertised sets', () => {
    const pair = {
      param1: [{ name: '', constant: 0xe4 }], param2: [{ name: '', constant: 0 }]
    }
    for (const metadata of [[modeSet(), pair], [pair, modeSet()]]) {
      expect(core.validateStudioUnicodeMetadata(detailsFixture(metadata), expanded('&uc 0xE4 0')))
        .toEqual({ status: 'accepted' })
    }
    expect(core.validateStudioUnicodeMetadata(detailsFixture([pair]), expanded('&uc UC_DE_AE'))).toEqual(missingSet)
  })

  it('accepts mode constants as well as ranges without using display labels', () => {
    const set = modeSet()
    set.param2 = [{ name: '', constant: 0 }, { name: '', constant: 5 }]
    const response = detailsFixture([set])
    response.behaviors.getBehaviorDetails.displayName = ''
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_SET_MACOS'))).toEqual({ status: 'accepted' })
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_SET_EMACS'))).toEqual({ status: 'accepted' })
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_SET_LINUX'))).toEqual(missingSet)
  })

  it('refuses absent driver metadata and the empty decoded metadata array', () => {
    const response = detailsFixture([])
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE'))).toEqual(missingSet)
    const { metadata: _metadata, ...details } = response.behaviors.getBehaviorDetails
    expect(core.validateStudioUnicodeMetadata({ behaviors: { getBehaviorDetails: details } }, expanded('&uc UC_DE_AE')))
      .toEqual(missingSet)
  })

  it.each(['param1', 'param2'] as const)('requires the advertised %s range to include the exact value', cell => {
    const response = detailsFixture()
    response.behaviors.getBehaviorDetails.metadata[0][cell] = [{ name: '', range: { min: 0, max: 100 } }]
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE'))).toEqual(missingSet)
  })

  it('requires zero to be advertised for the unshifted-only shortcut', () => {
    const response = detailsFixture()
    response.behaviors.getBehaviorDetails.metadata[0].param2 = [{ name: '', range: { min: 1, max: 0x10ffff } }]
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc 0xE4 0'))).toEqual(missingSet)
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE'))).toEqual({ status: 'accepted' })
  })

  it('does not combine cells from different parameter sets', () => {
    const response = detailsFixture([
      { param1: [{ name: '', constant: 0xe4 }], param2: [{ name: '', constant: 0 }] },
      { param1: [{ name: '', constant: 0 }], param2: [{ name: '', constant: 0xc4 }] }
    ])
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE'))).toEqual(missingSet)
    response.behaviors.getBehaviorDetails.metadata = [
      { param1: modeSet().param1, param2: [{ name: '', constant: 0 }] },
      { param1: [{ name: '', constant: 0 }], param2: modeSet().param2 }
    ]
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_SET_EMACS'))).toEqual(missingSet)
  })

  it('refuses a HID usage set even when both scalars are valid plain HID usages', () => {
    const hid = [{ name: 'Unicode', hidUsage: { keyboardMax: 255, consumerMax: 4095 } }]
    const response = detailsFixture([{ param1: hid, param2: hid }])
    response.behaviors.getBehaviorDetails.displayName = 'Unicode &uc'
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc 0x70004 0xC0001'))).toEqual(missingSet)
    for (const cell of ['param1', 'param2'] as const) {
      const mixed = detailsFixture()
      mixed.behaviors.getBehaviorDetails.metadata[0][cell] = hid
      expect(core.validateStudioUnicodeMetadata(mixed, expanded('&uc 0x70004 0xC0001'))).toEqual(missingSet)
    }
    response.behaviors.getBehaviorDetails.metadata.push(detailsFixture().behaviors.getBehaviorDetails.metadata[0])
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc 0x70004 0xC0001'))).toEqual({ status: 'accepted' })
  })

  it.each([[], [{ name: 'None', nil: {} }], [{ name: 'Layer', layerId: {} }]].map(options => ({ options })))(
    'does not infer a Unicode cell from absent/nil/layer options: %j', ({ options }) => {
      expect(core.validateStudioUnicodeMetadata(detailsFixture([{ param1: options, param2: options }]), expanded('&uc 0 0')))
        .toEqual(missingSet)
    }
  )

  it.each([6, 0x10ffff, 0xffffff])('refuses mode index %s even when numeric metadata allows it', param2 => {
    const response = detailsFixture([{
      param1: [{ name: 'Mode switch', constant: 0xffffff }],
      param2: [{ name: 'Overbroad mode range', range: { min: 0, max: 0x7fffffff } }]
    }])
    expect(core.validateStudioUnicodeMetadata(response, { behaviorId: 37, param1: 0xffffff, param2 }))
      .toMatchObject({ status: 'refused', reason: 'invalid-binding', path: 'binding.param2' })
  })

  it.each([0xd800, 0xdfff, 0x110000, 0xfffffe, 0x1000000])(
    'refuses non-scalar %s in either code-point cell even with permissive metadata', value => {
      const options = [{ name: 'Overbroad range', range: { min: 0, max: 0x7fffffff } }]
      const response = detailsFixture([{ param1: options, param2: options }])
      for (const [param1, param2] of [[value, 0], [0, value]]) {
        expect(core.validateStudioUnicodeMetadata(response, { behaviorId: 37, param1, param2 }))
          .toMatchObject({ status: 'refused', reason: 'invalid-binding' })
      }
    }
  )

  it('does not allow the mode sentinel in the Shift cell', () => {
    const response = detailsFixture([{
      param1: [{ name: '', constant: 0 }], param2: [{ name: '', constant: 0xffffff }]
    }])
    expect(core.validateStudioUnicodeMetadata(response, { behaviorId: 37, param1: 0, param2: 0xffffff }))
      .toMatchObject({ status: 'refused', reason: 'invalid-binding', path: 'binding.param2' })
  })

  it.each([-1, 0.5, NaN, Infinity, 0x100000000, '0', null, undefined])(
    'refuses malformed numeric cells without coercion: %s', value => {
      for (const cell of ['param1', 'param2'] as const) {
        const binding = { ...expanded('&uc UC_SET_MACOS'), [cell]: value } as core.StudioBehaviorBinding
        expect(core.validateStudioUnicodeMetadata(detailsFixture([modeSet()]), binding))
          .toMatchObject({ status: 'refused', reason: 'invalid-binding', path: `binding.${cell}` })
      }
    }
  )

  it.each([-1, 0x80000000, '37', undefined])('refuses invalid behavior identity %s', behaviorId => {
    expect(core.validateStudioUnicodeMetadata(detailsFixture(), { ...expanded('&uc UC_DE_AE'), behaviorId } as core.StudioBehaviorBinding))
      .toMatchObject({ status: 'refused', reason: 'invalid-binding' })
  })

  it('requires the response identity to match the supplied firmware behavior ID', () => {
    const response = detailsFixture()
    response.behaviors.getBehaviorDetails.id = 38
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE')))
      .toMatchObject({ status: 'refused', reason: 'unknown-behavior-id' })
  })

  it.each([null, undefined, {}, { behaviors: {} }])('never accepts missing response %j', response => {
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE')))
      .toMatchObject({ status: 'unavailable', reason: 'missing-response' })
  })

  it.each([
    null, {}, [null], [{ param1: [] }], [{ param1: [], param2: null }],
    [{ param1: [{ name: 'Unknown' }], param2: [] }],
    [{ param1: [{ name: '', range: { min: 2, max: 1 } }], param2: [] }],
    [{ param1: [{ name: '', range: { min: 0, max: 0x80000000 } }], param2: [] }],
    [{ param1: [{ name: '', range: { min: '0', max: 10 } }], param2: [] }],
    [{ param1: [{ name: '', constant: -1 }], param2: [] }],
    [{ param1: [{ name: '', constant: 0, range: { min: 0, max: 10 } }], param2: [] }],
    [{ param1: [{ constant: 0 }], param2: [] }]
  ].map(metadata => ({ metadata })))('refuses malformed metadata %j rather than throwing or accepting a partial set', ({ metadata }) => {
    const response = detailsFixture()
    const malformed = { ...response, behaviors: { getBehaviorDetails: { ...response.behaviors.getBehaviorDetails, metadata } } }
    expect(core.validateStudioUnicodeMetadata(malformed, expanded('&uc UC_DE_AE')))
      .toMatchObject({ status: 'refused', reason: 'invalid-response' })
  })

  it('validates every set before accepting, including unknown constraints and sparse arrays', () => {
    const response = detailsFixture()
    const metadata = response.behaviors.getBehaviorDetails.metadata
    metadata.push({ param1: [{ name: 'Unknown' }], param2: [] })
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE')))
      .toMatchObject({ status: 'refused', reason: 'invalid-response' })
    metadata[1] = { ...modeSet(), futureConstraint: true } as core.StudioBehaviorDetails['metadata'][number]
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE')))
      .toMatchObject({ status: 'refused', reason: 'unsupported-field' })
    delete metadata[1]
    expect(core.validateStudioUnicodeMetadata(response, expanded('&uc UC_DE_AE')))
      .toMatchObject({ status: 'refused', reason: 'invalid-response' })
  })

  it('refuses extra wire cells and malformed envelopes without mutating the inputs', () => {
    const response = detailsFixture()
    const binding = { ...expanded('&uc UC_DE_AE'), param3: 0 }
    const before = structuredClone({ response, binding })
    expect(core.validateStudioUnicodeMetadata(response, binding)).toMatchObject({ status: 'refused', reason: 'invalid-binding' })
    expect({ response, binding }).toEqual(before)
    expect(core.validateStudioUnicodeMetadata({ ...response, keymap: {} }, expanded('&uc UC_DE_AE')))
      .toMatchObject({ status: 'refused', reason: 'unsupported-field' })
    expect(core.validateStudioUnicodeMetadata({ ...response, requestId: -1 }, expanded('&uc UC_DE_AE')))
      .toMatchObject({ status: 'refused', reason: 'invalid-response' })
  })
})
