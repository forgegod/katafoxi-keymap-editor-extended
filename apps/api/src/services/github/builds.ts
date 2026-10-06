import * as api from './api.js'
import { createInstallationToken } from './auth.js'

/** How long a new commit may wait for its workflow run to appear. */
const PENDING_WINDOW_MS = 10 * 60 * 1000

type FirmwareBuildStatus =
  | 'none'
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'unavailable'

interface FirmwareBuild {
  status: FirmwareBuildStatus
  sha: string | null
  shortSha: string | null
  at: string | null
  htmlUrl: string | null
  artifactId: number | null
  artifactName: string | null
  detail: string | null
}

interface CommitPayload {
  sha: string
  commit?: { committer?: { date?: string } }
}

interface WorkflowRun {
  id: number
  head_sha: string
  status: string
  conclusion: string | null
  html_url: string
  created_at: string
  updated_at: string
}

interface Artifact {
  id: number
  name: string
  expired: boolean
}

/** Firmware zips are small; refuse anything larger before buffering a download. */
export const FIRMWARE_ARTIFACT_MAX_BYTES = 50_000_000

export class ArtifactTooLargeError extends Error {
  readonly name = 'ArtifactTooLargeError'
  constructor(readonly sizeInBytes: number) {
    super('Firmware artifact is too large')
  }
}

const EMPTY: FirmwareBuild = {
  status: 'none',
  sha: null,
  shortSha: null,
  at: null,
  htmlUrl: null,
  artifactId: null,
  artifactName: null,
  detail: null
}

function shortSha(sha: string | null | undefined): string | null {
  if (!sha) return null
  return sha.slice(0, 7)
}

function githubStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status
}

function unavailable(detail: string): FirmwareBuild {
  return { ...EMPTY, status: 'unavailable', detail }
}

export function firmwareArchiveName(name: string | null | undefined): string {
  const base = (name || 'firmware').replace(/[^A-Za-z0-9._-]+/g, '')
  const stem = base.replace(/\.zip$/i, '') || 'firmware'
  return `${stem}.zip`
}

function pickRun(runs: WorkflowRun[], sha: string): WorkflowRun | undefined {
  const matching = runs.filter(run => run.head_sha === sha)
  return (
    matching.find(run => run.status !== 'completed') ??
    matching.find(run => run.conclusion !== 'skipped') ??
    matching[0]
  )
}

function runPhase(run: WorkflowRun): FirmwareBuildStatus {
  if (run.status !== 'completed') {
    if (
      run.status === 'queued' ||
      run.status === 'waiting' ||
      run.status === 'requested' ||
      run.status === 'pending'
    ) {
      return 'queued'
    }
    return 'in_progress'
  }
  if (run.conclusion === 'success') return 'success'
  if (run.conclusion === 'cancelled' || run.conclusion === 'skipped') return 'cancelled'
  return 'failure'
}

function pickArtifact(artifacts: Artifact[]): Artifact | null {
  const usable = artifacts.filter(artifact => !artifact.expired)
  return (
    usable.find(artifact => artifact.name.toLowerCase() === 'firmware') ??
    usable[0] ??
    null
  )
}

async function installationToken(installationId: string, repository: string): Promise<string> {
  const { data } = await createInstallationToken(installationId, { repository })
  return (data as { token: string }).token
}

export async function fetchFirmwareBuild(
  installationId: string,
  repository: string,
  branch: string,
  now = Date.now()
): Promise<FirmwareBuild> {
  let token: string
  try {
    token = await installationToken(installationId, repository)
  } catch (err) {
    if (githubStatus(err) === 403) return unavailable('actions_permission')
    throw err
  }

  let commit: CommitPayload
  let runs: WorkflowRun[]
  try {
    const [commitRes, runsRes] = await Promise.all([
      api.request({
        url: api.githubApiPath('repos', repository, 'commits', branch),
        token
      }),
      api.request({
        url: api.githubApiPath('repos', repository, 'actions', 'runs'),
        token,
        params: { branch, per_page: '10' }
      })
    ])
    commit = commitRes.data as CommitPayload
    runs = ((runsRes.data as { workflow_runs?: WorkflowRun[] }).workflow_runs ?? [])
  } catch (err) {
    const status = githubStatus(err)
    if (status === 403) return unavailable('actions_permission')
    if (status === 404) return { ...EMPTY }
    throw err
  }

  const sha = commit.sha
  const committedAt = commit.commit?.committer?.date ?? null
  const run = pickRun(runs, sha)

  if (!run) {
    const age = committedAt ? now - Date.parse(committedAt) : Number.POSITIVE_INFINITY
    const waitingForKnownActions = runs.length > 0 && age >= 0 && age < PENDING_WINDOW_MS
    const waitingForFirstRun = runs.length === 0 && age >= 0 && age < 90_000
    if (waitingForKnownActions || waitingForFirstRun) {
      return {
        ...EMPTY,
        status: 'pending',
        sha,
        shortSha: shortSha(sha),
        at: committedAt
      }
    }
    return {
      ...EMPTY,
      sha,
      shortSha: shortSha(sha),
      at: committedAt
    }
  }

  const phase = runPhase(run)
  const build: FirmwareBuild = {
    status: phase,
    sha,
    shortSha: shortSha(sha),
    at: committedAt ?? run.created_at,
    htmlUrl: run.html_url,
    artifactId: null,
    artifactName: null,
    detail: null
  }

  if (phase !== 'success') return build

  try {
    const { data } = await api.request({
      url: api.githubApiPath('repos', repository, 'actions', 'runs', String(run.id), 'artifacts'),
      token,
      params: { per_page: '20' }
    })
    const artifact = pickArtifact(
      (data as { artifacts?: Artifact[] }).artifacts ?? []
    )
    if (artifact) {
      build.artifactId = artifact.id
      build.artifactName = artifact.name
    }
  } catch (err) {
    if (githubStatus(err) === 403) return unavailable('actions_permission')
    throw err
  }

  return build
}

export async function downloadFirmwareArtifact(
  installationId: string,
  repository: string,
  artifactId: string
): Promise<Response> {
  const token = await installationToken(installationId, repository)
  const { data } = await api.request({
    url: api.githubApiPath('repos', repository, 'actions', 'artifacts', artifactId),
    token
  })
  const size = (data as { size_in_bytes?: unknown }).size_in_bytes
  if (
    typeof size !== 'number' ||
    !Number.isFinite(size) ||
    size < 0 ||
    size > FIRMWARE_ARTIFACT_MAX_BYTES
  ) {
    throw new ArtifactTooLargeError(typeof size === 'number' ? size : -1)
  }
  const zip = await api.requestZip({
    url: api.githubApiPath('repos', repository, 'actions', 'artifacts', artifactId, 'zip'),
    token
  })
  const zipLength = zip.headers.get('content-length')
  if (zipLength) {
    const bytes = Number.parseInt(zipLength, 10)
    if (Number.isFinite(bytes) && bytes > FIRMWARE_ARTIFACT_MAX_BYTES) {
      throw new ArtifactTooLargeError(bytes)
    }
  }
  return zip
}
