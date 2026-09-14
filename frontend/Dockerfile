FROM node:20-slim AS base
WORKDIR /app
# Install the repository-pinned package manager into the shared base layer.
# Both deps and build inherit this layer, so the build stage never needs a
# second registry request merely to invoke pnpm.
RUN corepack enable \
    && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile --filter @tradeiq/frontend...

FROM base AS build
# Vite inlines VITE_* into the bundle at build time, and .dockerignore keeps
# frontend/.env out of the build context, so the API origins have to arrive as
# build args. Setting them on the runtime container instead is a no-op: that
# stage only serves the already-compiled dist.
ARG VITE_MARKET_TRADING_API_URL=http://localhost:3001
ARG VITE_IDENTITY_AUTH_API_URL=http://localhost:3002
ENV VITE_MARKET_TRADING_API_URL=$VITE_MARKET_TRADING_API_URL \
    VITE_IDENTITY_AUTH_API_URL=$VITE_IDENTITY_AUTH_API_URL
COPY --from=deps /app /app
COPY frontend ./frontend
RUN pnpm --filter @tradeiq/frontend run build

FROM node:20-slim AS runtime
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/frontend/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
