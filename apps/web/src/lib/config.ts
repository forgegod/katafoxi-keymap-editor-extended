function parseBoolean(val: string | undefined | null): boolean {
  return !!val && ['1', 'on', 'yes', 'true'].includes(val.toString().toLowerCase())
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
export const appBaseUrl = import.meta.env.VITE_APP_BASE_URL || ''
export const githubAppName = import.meta.env.VITE_GITHUB_APP_NAME || ''
export const enableGitHub = parseBoolean(import.meta.env.VITE_ENABLE_GITHUB)
export const enableLocal = parseBoolean(import.meta.env.VITE_ENABLE_LOCAL)
