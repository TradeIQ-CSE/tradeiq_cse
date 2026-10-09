FROM node:20-slim AS build
WORKDIR /app/frontend
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# Browser-visible API origins are compiled into the static bundle.
ARG VITE_MARKET_TRADING_API_URL=http://localhost:3001
ARG VITE_IDENTITY_AUTH_API_URL=http://localhost:3002
ARG VITE_ML_PREDICTION_API_URL=http://localhost:8001
ENV VITE_MARKET_TRADING_API_URL=$VITE_MARKET_TRADING_API_URL \
    VITE_IDENTITY_AUTH_API_URL=$VITE_IDENTITY_AUTH_API_URL \
    VITE_ML_PREDICTION_API_URL=$VITE_ML_PREDICTION_API_URL
COPY index.html tsconfig*.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN pnpm run build

FROM node:20-slim AS runtime
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server
COPY --from=build /app/frontend/dist ./dist
EXPOSE 5173
CMD ["node", "server/node_modules/serve/build/main.js", "-s", "dist", "-l", "5173"]
