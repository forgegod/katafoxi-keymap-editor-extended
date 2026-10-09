# Multi-stage build: Vite SPA + Hono API, same-origin production.
# Runtime listens on 0.0.0.0:8080.

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/cloudflare/package.json apps/cloudflare/
COPY packages/keymap-core/package.json packages/keymap-core/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Bake GitHub UI flags into the SPA (not secrets). Override at deploy via --build-arg.
ARG VITE_ENABLE_GITHUB=true
ARG VITE_GITHUB_APP_NAME=
ARG VITE_ENABLE_LOCAL=false
ENV VITE_ENABLE_GITHUB=$VITE_ENABLE_GITHUB \
    VITE_GITHUB_APP_NAME=$VITE_GITHUB_APP_NAME \
    VITE_ENABLE_LOCAL=$VITE_ENABLE_LOCAL \
    VITE_API_BASE_URL=
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    ENABLE_LOCAL=false \
    ENABLE_DEV_SERVER=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/cloudflare/package.json apps/cloudflare/
COPY packages/keymap-core/package.json packages/keymap-core/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/keymap-core/dist packages/keymap-core/dist
COPY --from=build /app/packages/keymap-core/data packages/keymap-core/data
EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
