FROM node:20-slim AS build
WORKDIR /app/services/identity-auth
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
# Argon2 can compile its native addon when no prebuilt binary is available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
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
WORKDIR /app/services/identity-auth
COPY --from=build /app/services/identity-auth/package.json ./
COPY --from=build /app/services/identity-auth/node_modules ./node_modules
COPY --from=build /app/services/identity-auth/dist ./dist
EXPOSE 3002
CMD ["node", "dist/main.js"]
