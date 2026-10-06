import { describe, expect, it } from 'vitest'
import {
  escapeRegExp,
  findAngleProp,
  findNamedBlock,
  hasBoolProp,
  hasPreprocessorConditional,
  iterateChildNodes,
  maskDts,
  matchBrace,
  parseUintList,
  tokenizeBindings
} from './dts-scan.js'

describe('maskDts', () => {
  it('replaces comments and string interiors with same-length spaces', () => {
    const src = 'a // {\n b /* } */ c "x{y}" d'
    const masked = maskDts(src)
    expect(masked.length).toBe(src.length)
    expect(masked.indexOf('{')).toBe(-1)
    expect(masked.indexOf('}')).toBe(-1)
    // Quotes stay so callers can recover string values from the original.
    expect(masked.includes('"')).toBe(true)
    expect(masked).toMatch(/^a + \n b + c " + " d$/)
  })

  it('masks an escaped quote and the following character inside a string', () => {
    const src = 'label = "a \\" b"; keymap { }'
    const masked = maskDts(src)
    expect(masked.length).toBe(src.length)
    expect(masked).toBe('label = "      "; keymap { }')
    expect(masked.indexOf('{')).toBe(src.indexOf('{'))
  })
})

describe('matchBrace', () => {
  it('ignores braces that only appear inside comments', () => {
    const src = 'node { // {\n  /* } */\n  inner { };\n};'
    const masked = maskDts(src)
    const open = masked.indexOf('{')
    const close = matchBrace(masked, open)
    expect(src.slice(open, close + 1)).toContain('inner { }')
    expect(src[close]).toBe('}')
    expect(close).toBe(src.lastIndexOf('}'))
  })
})

describe('findAngleProp', () => {
  it('does not treat sensor-bindings as bindings', () => {
    const src = `
      sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;
      bindings = <&kp ESC>;
      key-positions = <0 1>;
    `
    const masked = maskDts(src)
    const bindings = findAngleProp(masked, { start: 0, end: masked.length }, 'bindings')
    expect(bindings).not.toBeNull()
    expect(src.slice(bindings!.start, bindings!.end).trim()).toBe('&kp ESC')
    const sensors = findAngleProp(masked, { start: 0, end: masked.length }, 'sensor-bindings')
    expect(sensors).not.toBeNull()
    expect(src.slice(sensors!.start, sensors!.end).trim()).toBe(
      '&inc_dec_kp C_VOL_UP C_VOL_DN'
    )
  })

  it('matches nested angle depth instead of the first >', () => {
    const src = 'vals = <<1> <2>>;'
    const masked = maskDts(src)
    const interior = findAngleProp(masked, { start: 0, end: masked.length }, 'vals')
    expect(interior).not.toBeNull()
    expect(src.slice(interior!.start, interior!.end)).toBe('<1> <2>')
  })
})

describe('hasBoolProp', () => {
  it('does not match slow-release inside not-slow-release', () => {
    expect(hasBoolProp('not-slow-release;', 'slow-release')).toBe(false)
    expect(hasBoolProp('slow-release;', 'slow-release')).toBe(true)
    expect(hasBoolProp('foo; slow-release; bar;', 'slow-release')).toBe(true)
  })
})

describe('tokenizeBindings', () => {
  it('ignores & tokens that only appear inside comments', () => {
    expect(
      tokenizeBindings(' /* L & R */ &kp A // tail\n    &kp B ')
    ).toEqual(['&kp A', '&kp B'])
  })
})

describe('parseUintList', () => {
  it('reads non-negative integers and rejects mixed tokens', () => {
    expect(parseUintList(' 0 2 10 ')).toEqual([0, 2, 10])
    expect(parseUintList('')).toEqual([])
    expect(parseUintList('1 -2 x 3')).toBeNull()
    expect(parseUintList('LT0 LT1')).toBeNull()
  })
})

describe('iterateChildNodes', () => {
  it('keeps hyphenated names and labeled node spans', () => {
    const src = `/ {
    parent {
        layer-base { bindings = <&kp A>; };
        raise: layer_1 { bindings = <&kp B>; };
    };
};
`
    const masked = maskDts(src)
    const block = findNamedBlock(src, masked, 'parent')
    expect(block).not.toBeNull()
    const kids = [...iterateChildNodes(masked, block!)]
    expect(kids.map(k => k.name)).toEqual(['layer-base', 'layer_1'])
    expect(kids[0].label).toBeUndefined()
    expect(kids[1].label).toBe('raise')
    expect(src.slice(kids[1].labelStart, kids[1].nameStart)).toMatch(/^raise:\s*$/)
    expect(src.slice(kids[0].end, kids[1].labelStart)).toMatch(/^[ \t]*$/)
    expect(src[kids[0].end - 1]).toBe('\n')
  })
})

describe('findNamedBlock', () => {
  it('does not treat my-keymap as a keymap block', () => {
    const src = `
      my-keymap { compatible = "zmk,keymap"; decoy { bindings = <&kp A>; }; };
      keymap { compatible = "zmk,keymap"; live { bindings = <&kp B>; }; };
    `
    const masked = maskDts(src)
    const block = findNamedBlock(src, masked, 'keymap', {
      compatible: 'zmk,keymap',
      requireCompatible: true
    })
    expect(block).not.toBeNull()
    expect(src.slice(block!.bodyStart, block!.bodyEnd)).toContain('live')
    expect(src.slice(block!.keywordStart, block!.openBrace)).toMatch(/^\s*keymap\s*$/)
  })

  it('prefers the compatible block when several share a name', () => {
    const src = `
      combos { combo_a { bindings = <&kp A>; }; };
      combos {
        compatible = "zmk,combos";
        combo_b { bindings = <&kp B>; };
      };
    `
    const masked = maskDts(src)
    const block = findNamedBlock(src, masked, 'combos', {
      compatible: 'zmk,combos'
    })
    expect(block).not.toBeNull()
    expect(src.slice(block!.bodyStart, block!.bodyEnd)).toContain('combo_b')
    expect(src.slice(block!.bodyStart, block!.bodyEnd)).not.toContain('combo_a')
  })

  it('ignores a compatible that only appears in a comment', () => {
    const src = `
      keymap {
        /* compatible = "zmk,keymap"; */
        layer_0 { bindings = <&kp A>; };
      };
      keymap {
        compatible = "zmk,keymap";
        layer_1 { bindings = <&kp B>; };
      };
    `
    const masked = maskDts(src)
    const block = findNamedBlock(src, masked, 'keymap', {
      compatible: 'zmk,keymap',
      requireCompatible: true
    })
    expect(block).not.toBeNull()
    expect(src.slice(block!.bodyStart, block!.bodyEnd)).toContain('layer_1')
  })
})

describe('hasPreprocessorConditional', () => {
  it('sees branch directives on their own lines and ignores comments', () => {
    const src = `/ {
  keymap {
    compatible = "zmk,keymap";
    // #if 0
    layer_0 { bindings = <&kp A>; };
#if 0
    layer_1 { bindings = <&kp B>; };
#endif
  };
};
`
    const masked = maskDts(src)
    const block = findNamedBlock(src, masked, 'keymap')
    expect(block).not.toBeNull()
    expect(hasPreprocessorConditional(masked, { start: block!.bodyStart, end: block!.bodyEnd })).toBe(
      true
    )
    expect(hasPreprocessorConditional(maskDts('// #ifdef FOO\nkeymap { };'))).toBe(false)
  })
})

describe('escapeRegExp', () => {
  it('escapes metacharacters so a literal $& matches', () => {
    expect(escapeRegExp('a.b+c')).toBe('a\\.b\\+c')
    expect(new RegExp(`^${escapeRegExp('$&')}$`).test('$&')).toBe(true)
  })
})
