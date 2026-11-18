# CROWDPLAY — one long-running Node container (Railway / Fly.io / Render).
# Migrations run on boot (instrumentation.ts -> getDb()). Health: GET /api/health.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# postinstall builds @nexconn/server-sdk (its git package ships no dist/)
COPY scripts/build-nexconn-server-sdk.mjs ./scripts/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time: pass them as build args.
ARG NEXT_PUBLIC_NEXCONN_AREA
ARG NEXT_PUBLIC_REPO_URL
ENV NEXT_PUBLIC_NEXCONN_AREA=$NEXT_PUBLIC_NEXCONN_AREA \
    NEXT_PUBLIC_REPO_URL=$NEXT_PUBLIC_REPO_URL
RUN pnpm build && pnpm prune --prod

FROM base AS run
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/src/lib/db/migrations ./src/lib/db/migrations
# The story share image reads its hand-lettered font from here at request time.
COPY --from=build /app/src/components/depth/fonts ./src/components/depth/fonts
RUN mkdir -p .data && chown -R node:node .data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT:-3000}"]
