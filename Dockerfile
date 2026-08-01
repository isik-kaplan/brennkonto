# syntax=docker/dockerfile:1

FROM node:20-slim AS frontend
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

FROM python:3.12-slim AS runtime
RUN useradd --create-home --uid 1000 brennkonto
WORKDIR /app
COPY --from=backend /app /app
COPY --from=frontend /frontend/dist /app/static
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/app/data/brennkonto.sqlite3 \
    HOST=0.0.0.0 \
    PORT=8000
RUN mkdir -p /app/data && chown -R brennkonto:brennkonto /app
USER brennkonto

EXPOSE 8000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${PORT}/health')" || exit 1

# Shell form (not exec-form JSON) is deliberate - it's what lets ${HOST}/${PORT} expand from
# the environment; `exec` in front still hands PID 1 to litestar so it receives SIGTERM directly
# from `docker stop` instead of a wrapping shell swallowing it.
CMD exec litestar --app app.main:app run --host ${HOST} --port ${PORT}
