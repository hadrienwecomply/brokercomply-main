# syntax=docker/dockerfile:1
# Dashboard (Next.js) image for Railway. Build context = repo root (monorepo).
# Set on the Railway service: RAILWAY_DOCKERFILE_PATH=apps/dashboard/Dockerfile
# and root directory = repository root.

# ---- base: Node 20 (Debian) + pnpm via corepack -------------------------------
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# ---- deps: install the whole workspace (cached on manifests only) -------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Every workspace project's manifest is required for --frozen-lockfile to resolve.
COPY packages/shared/package.json packages/shared/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY tools/kb-compliance/package.json tools/kb-compliance/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile @brokercomply/shared, then next build ---------------------
FROM base AS build
COPY --from=deps /app/ ./
COPY . .
# A placeholder is enough: the `postgres` client is lazy (no connection at build),
# and pages are dynamic, so no real DB access happens during `next build`.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @brokercomply/shared build \
 && pnpm --filter @brokercomply/dashboard build

# ---- runtime: app + Chromium for the website-audit job ------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/ ./
# Install Chromium + its OS deps for Playwright (declared in @brokercomply/shared).
RUN pnpm --filter @brokercomply/shared exec playwright install --with-deps chromium
# Railway injects $PORT; next start honours it.
EXPOSE 3000
CMD ["pnpm", "--filter", "@brokercomply/dashboard", "start"]
