FROM oven/bun:1.3.13-debian AS base

WORKDIR /app
ARG TARGETARCH
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git nodejs npm \
  && corepack enable || true \
  && cloudflared_arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
  && case "${cloudflared_arch}" in amd64|arm64) ;; *) echo "Unsupported cloudflared architecture: ${cloudflared_arch}" >&2; exit 1 ;; esac \
  && curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cloudflared_arch}.deb" -o /tmp/cloudflared.deb \
  && apt-get install -y /tmp/cloudflared.deb \
  && rm -rf /var/lib/apt/lists/* /tmp/cloudflared.deb

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY packages/core/package.json packages/core/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV UPSTER_PORT=3377
ENV UPSTER_DATA_DIR=/data
ENV UPSTER_WORKSPACE_ROOTS=/workspaces
ENV UPSTER_APP_PORT_RANGE=41000-49151
ENV UPSTER_METRICS_PORT_RANGE=52000-60999
ENV DATABASE_URL=http://db:8080

EXPOSE 3377

CMD ["bun", "run", "--cwd", "apps/web", "preview", "--host", "0.0.0.0", "--port", "3377"]
