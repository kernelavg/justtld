# ─────────────────────────────────────────────────────────────────────────────
# JustTLD — единый образ для веб-приложения и indexer'а (PaaS: Render / Railway / Fly).
#
#   web:     docker run -e … -p 3000:3000 justtld                 (npm start)
#   indexer: docker run -e … justtld npm run indexer
#   всё сразу: -e RUN_INDEXER_IN_WEB=true
#
# NEXT_PUBLIC_* вшиваются в бандл на этапе сборки. Render автоматически передаёт
# переменные сервиса как build-args с теми же именами, поэтому ARG + ENV ниже работают
# «из коробки»; для локальной сборки: docker build --build-arg NEXT_PUBLIC_CHAIN_ID=1 …
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    npm_config_fund=false \
    npm_config_audit=false

# ── зависимости (кэшируемый слой) ──
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/indexer/package.json packages/indexer/
COPY contracts/package.json contracts/
RUN npm ci --include=dev

# ── сборка ──
FROM deps AS build
ARG NEXT_PUBLIC_CHAIN_ID=11155111
ARG NEXT_PUBLIC_CHAIN_NAME="Sepolia Testnet"
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_ENABLE_DEV_WALLET=false
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_CHAIN_NAME=$NEXT_PUBLIC_CHAIN_NAME \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_ENABLE_DEV_WALLET=$NEXT_PUBLIC_ENABLE_DEV_WALLET
COPY . .
RUN npm run build

# ── рантайм ──
FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/deployments ./deployments

RUN chmod +x scripts/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["scripts/docker-entrypoint.sh"]
CMD ["npm", "start"]
