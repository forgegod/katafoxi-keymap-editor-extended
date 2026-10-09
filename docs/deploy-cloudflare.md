# Cloudflare Containers deployment

This adapter runs the existing Node/Hono API and Vite SPA together on Cloudflare. A local computer is needed to build/upload the Docker image, but it is not the deployed runtime. GitHub Pages remains a separate static Demo/Clipboard testing site.

## This fork's hosted runtime

- Editor: https://zmkee.forgegod.workers.dev/
- Hono health: https://zmkee.forgegod.workers.dev/health
- GitHub App homepage: https://zmkee.forgegod.workers.dev
- GitHub OAuth callback: https://zmkee.forgegod.workers.dev/github/authorize

The hosted health endpoint, browser Demo/Clipboard smoke tests, GitHub source visibility, unauthenticated API guard, and OAuth redirect with secure cookies have been verified. GitHub is enabled using [zmkee](https://github.com/apps/zmkee), App ID `5255156`. Signed-in repository loading and commits still require the user's OAuth login and App installation; these smoke checks do not perform repository writes.

## Prerequisites

- Workers Paid on the exact Cloudflare account selected by Wrangler. A paid domain, Pro DNS/site plan, or a paid subscription on another account does not substitute for Workers Paid on this account.
- Docker running for a Dockerfile-based deployment (or a prebuilt registry image/Workers Builds).
- Node 24 and the workspace's pinned pnpm.
- A separate GitHub App for repository login/writes, when enabling that feature.

## Build and deploy

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @keymap-editor/cloudflare test
pnpm --filter @keymap-editor/cloudflare lint
pnpm --filter @keymap-editor/cloudflare build
pnpm --filter @keymap-editor/cloudflare exec wrangler login
pnpm --filter @keymap-editor/cloudflare exec wrangler whoami
pnpm --filter @keymap-editor/cloudflare run deploy
```

Use `run deploy`: `pnpm deploy` is a different, built-in pnpm command.

Review `apps/cloudflare/wrangler.json` before deploying. Its account ID selects the target account; `CLOUDFLARE_ACCOUNT_ID` can also select an account. The Worker name is `zmkee`, so the public hostname is `zmkee.<account-subdomain>.workers.dev` and the container application is `zmkee-keymapcontainer`. The Docker build context is the repository root. `image_vars` supplies non-secret Docker build arguments for the default container scheduling policy.

Renaming a Worker creates a new Worker and a new container application; it does not rename the existing pair. Deploy the new name, verify it, then delete the old Worker and its container application so it stops serving and billing.

Wrangler can activate the Worker before image upload/container provisioning finishes. A Worker version appearing in the dashboard is not proof that the Hono API is running. If provisioning is denied, do not treat the partial Worker upload as a successful deployment.

After deployment, verify the URL printed by Wrangler:

```bash
curl --fail --retry 4 --retry-all-errors --retry-delay 3 --max-time 90 https://YOUR-WORKER.workers.dev/health
pnpm --filter @keymap-editor/cloudflare exec wrangler containers list
PAGES_EXPECT_GITHUB=true PAGES_TEST_URL=https://YOUR-WORKER.workers.dev/ pnpm test:e2e:pages
```

Set `PAGES_EXPECT_GITHUB=true` for the enabled hosted runtime: the suite expects GitHub in the source menu and checks OAuth startup/session protection. Omit it for the static Pages site or a GitHub-disabled runtime: GitHub must be absent and the OAuth test is skipped. Clipboard export is exercised in both modes.

## Runtime and cost controls

- One named container (`keymap-editor`), `lite` instance, maximum one running instance. Requests are not load-balanced because Hono's login sessions are process-local.
- The container sleeps after 30 minutes without Durable Object activity. Cold requests start it again. Sleep/restart/deploy can sign users out; browser drafts and GitHub repository data are not stored in this container's memory.
- Initial provisioning or an image rollout can temporarily return HTTP 503. Wait for the hosted health check to succeed before smoke tests; an uploaded Worker alone is not readiness.
- The Worker waits for `/health` before forwarding requests. If startup/configuration fails, it returns HTTP 503 without exposing secrets.
- Local filesystem routes stay disabled. The Worker replaces proxy IP headers using Cloudflare's edge-provided client address.
- Runtime setting/secret changes cause a restart on the next request. Durable Object storage contains a configuration digest, not the secret values.
- Workers, Durable Objects, and container usage can incur charges. Set billing notifications in Cloudflare; one instance is a concurrency limit, not a monetary cap.

## GitHub App setup

The current deployment enables GitHub in both the image and runtime. For a fresh deployment, keep it disabled until the following settings are configured.

1. Use the final public HTTPS origin for the GitHub App homepage. Set its OAuth callback to `https://zmkee.forgegod.workers.dev/github/authorize`.
2. Configure Contents read/write, Metadata read, Actions read; disable webhooks unless separately implemented. Enable OAuth during installation. Install the App on the testing repositories.
3. Set `GITHUB_APP_ID` as a public Worker variable in `wrangler.json` (it is not a credential). Store `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_APP_PRIVATE_KEY` as Cloudflare runtime secrets. Never commit the client secret or private key, pass them as Docker build arguments, or paste them into chat. Wrangler retains secrets, but normal dashboard variables omitted from `wrangler.json` can be removed on deploy.
4. Set public Worker variable `APP_BASE_URL` to the canonical HTTPS origin, and set `ENABLE_GITHUB` to `true` only after all four runtime bindings exist. The adapter derives the OAuth callback from that origin and rejects incomplete credentials.
5. Set image arguments `VITE_ENABLE_GITHUB` to `true` and `VITE_GITHUB_APP_NAME` to the GitHub App slug, then rebuild/redeploy. The UI flags are baked into the image and cannot be changed by runtime variables alone.
6. Verify real OAuth login and repository load. Verify an intentional commit only against a repository/branch explicitly approved for writes.

The GitHub App's **Callback URL** is `/github/authorize`; its optional **Setup URL** can be the editor homepage. They serve different purposes. GitHub's authorization-during-installation return can include `code`, `installation_id`, and `setup_action` without OAuth state. The API does not exchange that unverified code or trust the installation ID: it returns an existing authenticated session to the editor, or starts fresh protected OAuth. Normal OAuth callbacks still require a matching, single-use state and cookie. If an old callback page failed, open the editor and choose GitHub again; do not copy/replay authorization-code URLs or paste them into chat.

Do not split the browser UI on github.io from this API without adapting the authentication topology: the current HttpOnly SameSite=Lax session design expects a same-origin UI/API.

## Account/plan errors

If `wrangler containers list` reports that Workers Paid is required, check the account name and ID from `wrangler whoami` against the account whose Workers subscription is paid. The API access check is authoritative even if a Worker upload succeeded. Resolve billing/account selection in Cloudflare before retrying; do not repeatedly redeploy an ineligible account.
