FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile --filter @tradeiq/frontend...

FROM base AS build
COPY --from=deps /app /app
COPY frontend ./frontend
RUN pnpm --filter @tradeiq/frontend run build

FROM node:20-slim AS runtime
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/frontend/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
