FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
# argon2 falls back to node-gyp when a prebuilt binary is unavailable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/identity-auth/package.json ./services/identity-auth/package.json
RUN pnpm install --frozen-lockfile --filter @tradeiq/identity-auth...

FROM base AS build
COPY --from=deps /app /app
COPY services/identity-auth ./services/identity-auth
RUN pnpm --filter @tradeiq/identity-auth run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/services/identity-auth
EXPOSE 3002
CMD ["node", "dist/main.js"]
