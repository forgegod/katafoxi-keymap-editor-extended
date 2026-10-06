/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_GITHUB_APP_NAME?: string
  readonly VITE_ENABLE_GITHUB?: string
  readonly VITE_ENABLE_LOCAL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
