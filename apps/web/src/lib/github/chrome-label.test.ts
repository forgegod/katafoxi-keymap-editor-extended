import { describe, expect, it } from 'vitest'
import {
  githubChipLabel,
  githubGateAction,
  manageReposUrl,
  repoChoiceLabel,
  shortRepoName
} from './chrome-label.js'

describe('short repo labels', () => {
  it('keeps the distinctive tail of a zmk-keyboard repo', () => {
    expect(shortRepoName('zmk-keyboard-lark')).toBe('lark')
    expect(repoChoiceLabel('katafoxi/zmk-keyboard-lark', ['katafoxi/zmk-keyboard-lark'])).toBe(
      'lark'
    )
  })

  it('leaves zmk-config whole', () => {
    expect(shortRepoName('zmk-config')).toBe('zmk-config')
    expect(repoChoiceLabel('katafoxi/zmk-config', ['katafoxi/zmk-config'])).toBe('zmk-config')
  })

  it('uses owner/name when two repos would shorten to the same word', () => {
    const names = ['katafoxi/zmk-keyboard-lark', 'other/lark']
    expect(repoChoiceLabel(names[0], names)).toBe('katafoxi/zmk-keyboard-lark')
    expect(repoChoiceLabel(names[1], names)).toBe('other/lark')
  })

  it('shortens each repo when the tails differ', () => {
    const names = ['katafoxi/zmk-keyboard-lark', 'katafoxi/zmk-keyboard-other']
    expect(repoChoiceLabel(names[0], names)).toBe('lark')
    expect(repoChoiceLabel(names[1], names)).toBe('other')
  })

  it('joins the short repo and branch for the closed chip', () => {
    expect(
      githubChipLabel('katafoxi/zmk-keyboard-lark', ['katafoxi/zmk-keyboard-lark'], 'main')
    ).toBe('lark · main')
    expect(githubChipLabel(null, [], null)).toBe('GitHub')
    expect(githubChipLabel('acme/lark', ['acme/lark'], null)).toBe('lark')
  })
})

describe('manageReposUrl', () => {
  it('opens the app install page when the app name is known', () => {
    expect(manageReposUrl('keymap-editor')).toBe(
      'https://github.com/apps/keymap-editor/installations/new'
    )
    expect(manageReposUrl('')).toBe('https://github.com/settings/installations')
  })
})

describe('githubGateAction', () => {
  it('sends a lone GitHub source straight to login or install', () => {
    expect(
      githubGateAction({
        onlySource: true,
        ready: true,
        authorized: false,
        appInstalled: false
      })
    ).toBe('login')
    expect(
      githubGateAction({
        onlySource: true,
        ready: true,
        authorized: true,
        appInstalled: false
      })
    ).toBe('install')
  })

  it('keeps the menu when Local is also a source', () => {
    expect(
      githubGateAction({
        onlySource: false,
        ready: true,
        authorized: false,
        appInstalled: false
      })
    ).toBeNull()
  })
})
