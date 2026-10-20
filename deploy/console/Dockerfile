# syntax=docker/dockerfile:1
# The console image: the Next.js standalone server, run as uid 10001 on a read-only root filesystem.
# Context: the repository root (see /.dockerignore). The console only reads; it holds no state.

FROM node:24-bookworm-slim AS build
WORKDIR /build/web
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY web/ ./
COPY openapi/ /build/openapi/
RUN pnpm build

FROM node:24-bookworm-slim AS app
RUN groupadd --gid 10001 console && useradd --uid 10001 --gid console --no-create-home console
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=10001:10001 /build/web/.next/standalone ./
COPY --from=build --chown=10001:10001 /build/web/.next/static ./.next/static
USER 10001:10001
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
