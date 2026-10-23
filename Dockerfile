# syntax=docker/dockerfile:1

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
# Dependencies first so code changes don't reinstall them.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# The build never opens a database connection, so no DATABASE_URL is needed here.
RUN pnpm build

FROM node:24-slim AS runtime
ENV NODE_ENV=production PORT=3010 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3010
CMD ["node", "server.js"]
