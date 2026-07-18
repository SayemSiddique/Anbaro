# Build from the repository root: docker build -f services/api/Dockerfile .
# glibc base: argon2's native prebuilds are exercised in CI against glibc.
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY services/api/package.json services/api/package.json
RUN pnpm install --frozen-lockfile --filter @anbaro/api
COPY services/api services/api
RUN pnpm --filter @anbaro/api build \
  && pnpm --filter @anbaro/api --legacy deploy --prod /out

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN useradd --system --create-home --shell /usr/sbin/nologin api
WORKDIR /app
COPY --from=build --chown=api:api /out /app
USER api
EXPOSE 3001
# DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, WEB_ORIGIN, TRUST_PROXY and the
# Stripe secrets are injected by the environment; the server fails fast when
# a required value is missing.
CMD ["node", "dist/server.js"]
