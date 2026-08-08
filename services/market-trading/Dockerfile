FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/market-trading/package.json ./services/market-trading/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile --filter @tradeiq/market-trading...

FROM base AS build
COPY --from=deps /app /app
COPY services/market-trading ./services/market-trading
COPY packages/tsconfig ./packages/tsconfig
RUN pnpm --filter @tradeiq/market-trading run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/services/market-trading/dist ./dist
COPY --from=build /app/services/market-trading/node_modules ./node_modules
COPY --from=build /app/node_modules ./root_node_modules
EXPOSE 3001
CMD ["node", "dist/main.js"]
