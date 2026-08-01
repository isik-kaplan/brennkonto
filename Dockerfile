# syntax=docker/dockerfile:1

FROM node:24-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build \
    # litestar's static file router only falls back to index.html for a directory request -
    # a 404.html copy is what makes unmatched client-side routes (e.g. /login on refresh) serve
    # the SPA shell instead of a bare 404.
    && cp dist/index.html dist/404.html

FROM python:3.12-slim AS backend
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /uvx /usr/local/bin/
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-install-project --no-dev
COPY backend/app ./app

# `litestar run` (used below) already serves the app through uvicorn - a real ASGI server, not
# litestar's dev-only fallback - so the only thing missing for a conventional prod setup was a
# reverse proxy in front of it. nginx here serves the built static assets directly (with far-
# future caching on hashed filenames) and proxies /api + /health through to uvicorn, which binds
# 127.0.0.1 only and is never reachable directly from outside the container.
FROM python:3.12-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 brennkonto

WORKDIR /app
COPY --from=backend /app /app
COPY --from=frontend /frontend/dist /app/static
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/app/data/brennkonto.sqlite3

RUN mkdir -p /app/data && chown -R brennkonto:brennkonto /app
# nginx's master process stays root (only way to bind the privileged port 80) and its workers
# drop to the package's own default unprivileged user - the app process is dropped to
# `brennkonto` explicitly in entrypoint.sh instead of running the whole container as root.

EXPOSE 80
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1/health')" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
