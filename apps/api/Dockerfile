# Estene API — build from the repo root:
#   docker build -f apps/api/Dockerfile -t estene-api .
# Only the API, @estene/contracts and @estene/config enter the build; the image
# holds the bundled server plus production dependencies, no source.

FROM node:22-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
# Git hooks are for developers, not images.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN npm pkg delete scripts.prepare
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter @estene/api...
COPY packages/contracts packages/contracts
COPY packages/config packages/config
COPY apps/api apps/api
RUN pnpm --filter @estene/api build \
 && pnpm --filter @estene/api deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/health" >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/server.js"]
