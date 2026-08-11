FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/market-trading/package.json ./services/market-trading/package.json
RUN pnpm install --frozen-lockfile --filter @tradeiq/market-trading...

FROM base AS build
COPY --from=deps /app /app
COPY services/market-trading ./services/market-trading
RUN pnpm --filter @tradeiq/market-trading run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/services/market-trading
EXPOSE 3001
CMD ["node", "dist/main.js"]
