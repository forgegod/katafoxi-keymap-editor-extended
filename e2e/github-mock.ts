import type { Page, Route } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseDtsKeymap,
  parseHostKeymapSnapshot,
  parseKeymap
} from '../packages/keymap-core/dist/index.js'

export const HEAD_SHA = 'a1b2c3d4e5f6789012345678901234567890abcd'
export const REPO_FULL_NAME = 'acme/lark'
export const INSTALLATION_ID = '1'
export const BRANCH_MAIN = 'main'
export const BRANCH_FEATURE = 'feature'
export const ARTIFACT_ID = 99

const LARK_DIR = path.join(process.cwd(), 'packages/keymap-core/fixtures/lark')

const info = JSON.parse(
  fs.readFileSync(path.join(LARK_DIR, 'info.json'), 'utf8')
) as unknown
const keymap = parseKeymap(
  parseDtsKeymap(fs.readFileSync(path.join(LARK_DIR, 'lark.keymap'), 'utf8'))
)

const hostSnapshotRaw = {
  version: 1,
  view: {
    columns: [
      {
        language: 'en',
        layoutId: 'user:en-1',
        visible: true,
        altGr: true,
        altGrShift: true
      }
    ],
    open: null
  },
  layouts: [
    {
      id: 'user:en-1',
      name: 'Custom English',
      language: 'en',
      origin: { from: 'copy', layoutId: 'system-us' },
      keys: [
        {
          zmk: 'Q',
          keysyms: ['q', 'Q', 'NoSymbol', 'NoSymbol'],
          glyphs: ['q', 'Q', '', '']
        }
      ]
    }
  ]
}

const parsedSnapshot = parseHostKeymapSnapshot(hostSnapshotRaw)
if (!parsedSnapshot.ok) {
  throw new Error(`github-mock hostSnapshot is ${parsedSnapshot.error}`)
}

const keyboardFiles = {
  info,
  keymap,
  hostSnapshot: parsedSnapshot.snapshot,
  headSha: HEAD_SHA
}

const installation = {
  login: 'octocat',
  installations: [{ id: Number(INSTALLATION_ID) }],
  repositories: [
    {
      id: 11,
      full_name: REPO_FULL_NAME,
      default_branch: BRANCH_MAIN
    }
  ],
  repoInstallationMap: { [REPO_FULL_NAME]: INSTALLATION_ID }
}

const branches = [{ name: BRANCH_MAIN }, { name: BRANCH_FEATURE }]

const firmwareBuild = {
  status: 'success',
  sha: HEAD_SHA,
  shortSha: HEAD_SHA.slice(0, 7),
  at: '2026-10-06T11:00:00.000Z',
  htmlUrl: `https://github.com/${REPO_FULL_NAME}/actions/runs/1`,
  artifactId: ARTIFACT_ID,
  artifactName: 'firmware',
  detail: null
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })
}

function githubPath(url: string): string {
  return new URL(url).pathname.replace(/\/+$/, '')
}

export type GithubMock = {
  commits: unknown[]
  authorizeRequested: boolean
  failAuth: () => void
  staleCommit: () => void
}

/** Intercept same-origin `/github/*` so the real GitHub API is unused. */
export async function installGithubMocks(page: Page): Promise<GithubMock> {
  const commits: unknown[] = []
  const state: GithubMock = {
    commits,
    authorizeRequested: false,
    failAuth() {
      failingAuth = true
    },
    staleCommit() {
      commitStatus = 409
      commitBody = {
        name: 'StaleRepoBase',
        errors: ['Branch changed on GitHub — reload']
      }
    }
  }

  let failingAuth = false
  let commitStatus = 200
  let commitBody: unknown = { ok: true, mode: 'splice', warnings: [] }

  // Match only the SPA API (`/github/...`), not Vite modules under `/src/lib/github/`.
  await page.route(
    url => url.pathname === '/github' || url.pathname.startsWith('/github/'),
    async route => {
      const method = route.request().method().toUpperCase()
      const pathname = githubPath(route.request().url())

      if (pathname === '/github/authorize' || pathname.startsWith('/github/authorize')) {
        return route.fallback()
      }

      if (failingAuth) {
        return json(route, 401, { error: 'unauthorized' })
      }

      if (method === 'GET' && pathname === '/github/installation') {
        return json(route, 200, installation)
      }

      if (method === 'GET' && pathname.endsWith('/branches')) {
        return json(route, 200, branches)
      }

      if (method === 'POST' && pathname.includes('/keyboard-files/')) {
        const raw = route.request().postData()
        commits.push(raw ? JSON.parse(raw) : null)
        return json(route, commitStatus, commitBody)
      }

      if (method === 'GET' && pathname.includes('/keyboard-files/')) {
        return json(route, 200, keyboardFiles)
      }

      if (method === 'GET' && /\/builds\/[^/]+\/[^/]+$/.test(pathname)) {
        return json(route, 200, firmwareBuild)
      }

      return json(route, 404, { error: 'unmocked github path', pathname, method })
    }
  )

  // Intercept login so navigation stays on this origin and IndexedDB stays readable.
  await page.route(
    url => url.pathname === '/github/authorize' || url.pathname.startsWith('/github/authorize'),
    async route => {
      state.authorizeRequested = true
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>GitHub authorize</title>'
      })
    }
  )

  return state
}
