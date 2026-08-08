FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/identity-auth/package.json ./services/identity-auth/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile --filter @tradeiq/identity-auth...

FROM base AS build
COPY --from=deps /app /app
COPY services/identity-auth ./services/identity-auth
COPY packages/tsconfig ./packages/tsconfig
RUN pnpm --filter @tradeiq/identity-auth run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/services/identity-auth/dist ./dist
COPY --from=build /app/services/identity-auth/node_modules ./node_modules
COPY --from=build /app/node_modules ./root_node_modules
EXPOSE 3002
CMD ["node", "dist/main.js"]
