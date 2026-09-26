# brennkonto

A calorie and macro tracker. Log what you eat by grams, macros come from
[Open Food Facts](https://world.openfoodfacts.org/data), and daily/weekly/monthly/custom-range
aggregates tell you how you're actually doing against your goals.

- **Backend**: Litestar + SQLAlchemy (async) + SQLite, session-cookie auth, `isik` for env config.
- **Frontend**: Vite + React + TypeScript + react-router, `@isik-kaplan/core` for form/date utilities.
- **Deploy**: one Dockerfile (multi-stage: build frontend, install backend deps, slim runtime
  serving both the API and the built SPA from a single process).

## Local development

Backend (needs [uv](https://docs.astral.sh/uv/)):

```sh
cd backend
cp ../example.env ../.env   # then edit .env - SECRET_KEY at minimum
uv sync
uv run litestar --app app.main:app run --reload
```

Frontend (separate terminal):

```sh
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:8000` (see `frontend/vite.config.ts`),
so run the backend on its default port. For local http (non-TLS) dev, set
`SESSION_COOKIE_SECURE=False` in `.env` - browsers won't store a `Secure` cookie over plain http.

## Testing

Backend (pytest + hypothesis property-based tests, 100% branch coverage enforced):

```sh
cd backend
uv run pytest --cov --cov-report=term-missing
```

Frontend (vitest + fast-check property-based tests, 100% coverage enforced):

```sh
cd frontend
npm run test:coverage
```

### Mutation testing

Coverage only proves a line ran; mutation testing proves a test would notice if it were wrong. Every
mutant has to be killed by a test, or exempted with a reason why nothing the app does can differ.

Backend (mutmut). `mutmut run` itself exits 0 whatever survives - `check_mutants.py` re-runs each
survivor against the whole suite and fails on anything still alive:

```sh
cd backend
rm -rf mutants && uv run mutmut run && uv run python scripts/check_mutants.py
```

Exemptions live in `backend/mutation-exemptions.toml`, keyed by function and pinned to a hash of
it, so editing the function forces the entry to be re-read. Inspect a survivor with
`uv run mutmut show <name>`.

Frontend (Stryker, fails below a 100% score). Incremental, so a re-run only re-tests what changed -
but a mutant cached as "survived" is never re-tested when only a test changed, so finish with a
`--force` run before trusting a 100%:

```sh
cd frontend
npm run test:mutation              # report: reports/mutation/index.html
npx stryker run --force            # every mutant, ignoring the cache
```

A frontend exemption is a `// Stryker disable next-line <mutator>: <reason>` comment directly above
the code it covers - it binds to the next node, so a comment in JSX (`{/* */}`) binds to nothing.
Two whole classes are ignored by `stryker-plugins/ignore-equivalent.mjs`: fixed `className`/`style`
values (jsdom lays nothing out) and empty hook dependency lists (any constant list runs once).

Both also run in CI - by hand, and weekly - via `.github/workflows/mutation.yml`.

A `backend/scripts/seed_demo_data.py` script is available for seeding a couple of years of
realistic daily food logs into a fresh account, useful for exercising the aggregate views:
`uv run python scripts/seed_demo_data.py [email] [password] [display_name] [days]`.

## Pre-commit

```sh
pip install pre-commit  # or: brew install pre-commit
pre-commit install
```

Runs ruff (backend) and eslint/prettier/tsc (frontend) on staged files, plus the usual
whitespace/large-file hygiene checks. `pre-commit run --all-files` runs everything once.

## Configuration

All configuration is environment variables, read via `isik.common.config` in
`backend/app/config.py`. Copy `example.env` to `.env` (already gitignored) and fill it in -
`SECRET_KEY` is the only required value; everything else has a documented default.

## Docker / Coolify

```sh
docker build -t brennkonto .
docker run -p 8000:8000 -e SECRET_KEY=... -v brennkonto-data:/app/data brennkonto
```

On Coolify: point it at this repo, it'll detect the Dockerfile. Set `SECRET_KEY` (and any other
overrides from `example.env`) as environment variables, and mount a persistent volume at
`/app/data` so the SQLite database survives redeploys. The image exposes port 8000 and ships a
`/health` endpoint the platform's healthcheck can use.

## Layout

```
backend/    Litestar API - app/controllers, app/models.py, app/services/off_client.py
frontend/   React SPA - src/pages, src/components, src/styles/tokens.css (design system)
Dockerfile  multi-stage build, single image for both
```
