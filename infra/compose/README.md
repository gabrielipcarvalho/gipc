# gipc — local dev stack

One command bootstraps a local instance of the whole platform:

```sh
cd infra/compose
docker compose up          # no .env needed — see .env.example for optional overrides
```

Then browse **http://localhost:8088** — the local Caddy proxy that mirrors production's route
table (`/api/ai/*` → ai, `/api/*` → core, everything else → web). The site only works through
this origin: relative `/api/*` fetches and the SSE streams need the proxy, exactly like prod.

First run is slow (image pulls, `npm ci`, `uv sync`, the embedding model download) — everything
lands in named volumes, so subsequent starts take seconds.

## Ports (all bound to 127.0.0.1)

| Port  | What | Notes |
|-------|------|-------|
| 8088  | **the site** (Caddy proxy) | use this one |
| 3000  | next dev direct | `/api/*` is dead here by design — debugging only |
| 8080  | core (Go) | `curl localhost:8080/api/healthz` |
| 8000  | ai (FastAPI) | `curl localhost:8000/api/ai/healthz` |
| 5433  | postgres (pgvector) | 5433 because a Mac often owns 5432 |
| 9091  | prometheus (obs profile) | |
| 3002  | grafana (obs profile) | anonymous read-only; admin login via `.env` |
| 3101  | loki (obs profile) | |
| 11435 | ollama (ollama profile) | 11435 because this Mac's own ollama owns 11434 |

## Profiles

```sh
docker compose up                              # slim: proxy + web + core + ai + postgres
docker compose --profile obs up                # + prometheus, grafana, loki, promtail
docker compose --profile ollama up             # + local model server
```

## What works locally vs honest-empty

This is a **dev-fidelity** stack, not prod parity — dev servers behind a local proxy, no cluster:

- **Lab (chaos/load/DB explorer) + topology**: 503 / "offline" honestly — there is no Kubernetes
  here (`LAB_ENABLED=false`, `TOPOLOGY_ENABLED=false`).
- **/system deep panels**: honest empties — the metrics they query (caddy/cadvisor series) exist
  only in the cluster's Prometheus. The local obs profile scrapes only real local targets
  (prometheus itself, grafana, loki); core/ai/web expose no `/metrics`, and scraping nonexistent
  endpoints would just fabricate permanently-down targets (deliberate deviation from "scrape the
  three services").
- **Oracle / JD analyzer**: need `ANTHROPIC_API_KEY` in `.env`. Empty key = honest 503. The
  oracle's tools query the **local** core (`CORE_BASE=http://core:8080`), never prod.
- **Local inference demo**: needs the `ollama` profile + a pulled model:
  `docker compose exec ollama ollama pull qwen2.5:0.5b-instruct`
- **RAG corpus**: seed it once the stack is up:
  `docker compose exec ai uv run --no-sync python -m app.ingest`
  (the code corpus `code.json` is baked only in CI images — its absence locally is a designed
  degrade). Privacy: the raw `resume.json` enters the container, but the loader's
  `BASICS_PUBLIC_FIELDS` allowlist keeps phone/private fields out of the knowledge base — that
  allowlist is the tested boundary.

## Gotchas

- **Shell env beats `.env`**: an exported `ANTHROPIC_API_KEY` in your shell silently arms the
  real-money oracle. Unset it, or set the key in `.env` deliberately. Keep real keys out of this
  directory when running `scripts/verify.sh` (its secret scan reads `infra/**.env*`).
- **Single-file binds are inode-pinned**: `package.json`, `package-lock.json` and the three
  `/corpus` files are bound as files — editors that write-via-rename (VS Code) swap the inode,
  so restart the affected service after editing them.
- **Changed npm deps**: the web container re-runs `npm ci` automatically when
  `package-lock.json`'s hash changes; if node_modules ever wedges, `docker compose down -v`.
- **Changed `POSTGRES_PASSWORD` after first init**: the `pgdata` volume keeps the OLD password
  while ai's `DATABASE_URL` uses the new one → auth failures. `down -v` re-initializes.
- **colima**: file-watching uses polling (`WATCHPACK_POLLING`, `WATCHFILES_FORCE_POLLING`) —
  already set. Promtail reads container logs inside colima's VM; only a non-json-file log
  driver breaks it.

## Teardown

```sh
docker compose --profile obs --profile ollama down -v   # profiles must be named — a bare
                                                        # `down -v` skips inactive profiles
```

`down -v` wipes postgres (re-run the ingest after the next `up`), plus all caches.
