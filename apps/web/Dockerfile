FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile --filter @tradeiq/web...

FROM base AS build
COPY --from=deps /app /app
COPY apps/web ./apps/web
COPY packages/tsconfig ./packages/tsconfig
RUN pnpm --filter @tradeiq/web run build

FROM node:20-slim AS runtime
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/apps/web/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
