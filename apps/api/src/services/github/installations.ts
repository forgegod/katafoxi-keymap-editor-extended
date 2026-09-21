import LinkHeader from 'http-link-header'
import * as api from './api.js'
import { createInstallationToken } from './auth.js'

export async function fetchInstallations(userToken: string) {
  const url = '/user/installations'
  const { data } = await api.request({ url, token: userToken })
  const installations = (data as { installations: Array<{ suspended_at?: string }> })
    .installations
  return installations.filter(installation => !installation.suspended_at)
}

export async function fetchInstallationRepos(userToken: string) {
  const repositories: unknown[] = []
  const installations = await fetchInstallations(userToken)
  const repoInstallationMap: Record<string, number> = {}

  for (const installation of installations as Array<{ id: number }>) {
    const { data } = await createInstallationToken(String(installation.id))
    const token = (data as { token: string }).token

    let url: string | undefined = `/installation/repositories`
    while (url) {
      const res = await api.request({ url, token })
      const paging = LinkHeader.parse((res.headers.link as string) || '')
      const pageData = res.data as { repositories: Array<{ full_name: string }> }

      repositories.push(...pageData.repositories)
      for (const repo of pageData.repositories) {
        repoInstallationMap[repo.full_name] = installation.id
      }

      url = paging.get('rel', 'next')?.[0]?.uri
    }
  }

  return { installations, repositories, repoInstallationMap }
}

export async function fetchRepoBranches(installationToken: string, repo: string) {
  const branches: unknown[] = []
  let url: string | undefined = `/repos/${repo}/branches`
  while (url) {
    const res = await api.request({ url, token: installationToken })
    const paging = LinkHeader.parse((res.headers.link as string) || '')
    branches.push(...(res.data as unknown[]))
    url = paging.get('rel', 'next')?.[0]?.uri
  }
  return branches
}
