FROM node:20-slim AS build
WORKDIR /app/services/market-trading
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN pnpm run build \
    && test -f dist/main.js \
    && rm -f dist/tsconfig.build.tsbuildinfo \
    && pnpm prune --prod

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/services/market-trading
COPY --from=build /app/services/market-trading/package.json ./
COPY --from=build /app/services/market-trading/node_modules ./node_modules
COPY --from=build /app/services/market-trading/dist ./dist
EXPOSE 3001
CMD ["node", "dist/main.js"]
