<div align="center">
  <img src="frontend/assets/gnome_only.jpg" alt="myGnomie" width="140" />

  # myGnomie

  **An AI-assisted plant tracker built to explore event-sourced garden data.**

  Log what happens in a garden in plain language, and myGnomie turns it into a structured,
  queryable history — then projects that history back into live plant state, care reminders,
  and a calendar, on demand.

  [![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
  [![Supabase](https://img.shields.io/badge/database-Supabase%20%2F%20Postgres-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
  [![Pydantic](https://img.shields.io/badge/validation-Pydantic%20v2-E92063)](https://docs.pydantic.dev/)
  [![React](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=white)](https://react.dev/)
  [![Docker](https://img.shields.io/badge/deploy-Docker%20Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
  [![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

</div>

---

> **Portfolio note:** this project exists to demonstrate backend design and data-modeling
> decisions — event sourcing, derived-state projections, row-level multi-tenancy, and a typed
> API surface — rather than to ship as a finished consumer product. The README below is written
> accordingly: it leads with architecture, not screenshots.

## Table of contents

- [Why this project exists](#why-this-project-exists)
- [Architecture at a glance](#architecture-at-a-glance)
- [The core idea: gardens as an event log](#the-core-idea-gardens-as-an-event-log)
- [Data model](#data-model)
- [Backend design](#backend-design)
- [AI integration](#ai-integration)
- [Repository layout](#repository-layout)
- [Running it locally](#running-it-locally)
- [Testing](#testing)
- [Design decisions & trade-offs](#design-decisions--trade-offs)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why this project exists

Most "tracker" apps store *current state* — a plant's row gets overwritten every time
something changes, and you lose the history of how it got there. myGnomie is built the
opposite way: **every write is an immutable event**, and everything you see in the UI —
a plant's growth stage, its last watering date, whether it needs attention today — is a
**projection computed from that event log**, never stored state that can drift out of sync.

This repo is the result of deliberately over-engineering a small hobby app to practice the
patterns that matter at larger scale: append-only logs, derived views, tenant isolation
enforced at the database layer, and a typed contract between frontend and backend.

## Architecture at a glance

```
┌──────────────────────┐        HTTPS / Bearer JWT        ┌───────────────────────────┐
│   React 18 + Vite     │ ───────────────────────────────▶ │        FastAPI            │
│   (frontend/)          │ ◀─────────────────────────────── │        (api/)              │
│                        │        JSON over REST           │                            │
│  • Client-side          │                                │  • Auth via Supabase JWT   │
│    projections()        │                                │  • Per-request Postgres    │
│    (mirror of backend   │                                │    client, scoped by RLS   │
│    logic, for instant   │                                │  • Pydantic-validated I/O  │
│    UI feedback)         │                                │  • OpenRouter LLM calls    │
└──────────────────────┘                                 └─────────────┬─────────────┘
                                                                          │
                                                                          ▼
                                                          ┌───────────────────────────┐
                                                          │   Supabase (Postgres)      │
                                                          │                            │
                                                          │  gardens ─┬─ plantings      │
                                                          │           ├─ containers     │
                                                          │           └─ garden_events  │
                                                          │                (event log)  │
                                                          │  plants (USDA reference     │
                                                          │  catalog, read-only)        │
                                                          │                            │
                                                          │  Row-Level Security scopes  │
                                                          │  every table to auth.uid()  │
                                                          └───────────────────────────┘
```

Two independently deployable services, one shared contract:

| Service | Stack | Responsibility |
|---|---|---|
| **`api/`** | FastAPI, Pydantic v2, `supabase-py`, `httpx` | Auth, validation, event persistence, LLM orchestration, third-party lookups |
| **`frontend/`** | React 18, Vite, vanilla CSS | UI + a client-side mirror of the projection logic for optimistic rendering |

Both ship as containers (`infra/Dockerfile.api`, `infra/Dockerfile.frontend`) behind a single
`docker compose up`, and both also deploy as a single Vercel project (`vercel.json` rewrites
`/api/*` to the FastAPI entrypoint and everything else to the SPA).

## The core idea: gardens as an event log

Instead of a `plantings` table with mutable columns like `current_stage` or
`last_watered_at`, the source of truth is `garden_events` — an append-only table where every
row is one fact that happened:

```json
{
  "entity_type": "planting",
  "entity_id": "planting_123",
  "event_type": "watering",
  "category": "action",
  "payload": { "amount_l": 0.5, "method": "hand" },
  "timestamp": "2026-09-10T09:00:00Z"
}
```

"Current state" is never written — it's **derived at read time** by folding the relevant
events for an entity in chronological order:

```js
// frontend/lib/projections.js
export function projectPlanting(planting, events) {
  const own = events
    .filter(e => e.entity_type === "planting" && e.entity_id === planting.id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const lastStageChange = [...own].reverse().find(e => e.event_type === "stage_change");
  const lastWater       = [...own].reverse().find(e => e.event_type === "watering");
  const ended           = [...own].reverse().find(e => e.event_type === "planting_ended");
  // ...

  return {
    stage: lastStageChange?.payload?.to_stage ?? "unknown",
    status: ended ? "ended" : "active",
    last_watered_at: lastWater?.timestamp,
    // ...
  };
}
```

This buys a few properties for free:

- **Full audit trail.** Every correction is a new event, never a silent overwrite — the AI
  chat's "edit" flow (`api/chat.py`) patches a past event's payload rather than mutating
  derived state directly.
- **Cheap new features.** The calendar (`frontend/lib/calendar.js`) and reminders engine
  (`frontend/lib/reminders.js`) are just *additional* folds over the same log — no schema
  migration or backfill needed to add them.
- **Deterministic replays.** Given the same event set, the projection is always identical,
  which makes the projection logic trivially unit-testable (see `frontend/tests/`).

## Data model

```
gardens                    plantings                    containers
├─ id (pk)                 ├─ id (pk)                    ├─ id (pk)
├─ user_id (RLS key)       ├─ garden_id (fk)              ├─ garden_id (fk)
├─ name, type              ├─ plant_id (fk → plants)      ├─ type, material, volume_l
├─ location {lat,lng}      └─ nickname                    └─ mobility
├─ hardiness_zone
└─ hardiness_zone_temp_range_f      garden_events (event log)
                                    ├─ id (pk)
plants  (read-only reference)      ├─ garden_id (fk)
├─ id (pk)                         ├─ entity_type / entity_id  (polymorphic: garden | planting | container)
├─ plant_name, latin_name          ├─ event_type   (watering, harvest, pest_sighting, stage_change, …)
├─ ph_min / ph_max                 ├─ category     (action | measurement | observation | lifecycle)
├─ moisture_use, drought_tolerance ├─ payload jsonb
├─ shade_tolerance, growth_habit   ├─ note, media[]
└─ usda_source_url                 ├─ confidence   (observed | inferred)
                                    └─ timestamp
```

- **`plants`** is a normalized, read-only ingest of the USDA PLANTS database — real botanical
  ranges (pH tolerance, moisture use, drought/shade tolerance) rather than hardcoded demo
  values. `frontend/lib/speciesEstimates.js` derives softer, UI-facing heuristics (watering
  cadence, target harvest stage) from these hard USDA fields, documented inline with the
  reasoning for each mapping.
- **`payload`** is intentionally `jsonb` — the event schema is polymorphic by `event_type`,
  validated at the API boundary by per-request Pydantic models (`api/chat.py`,
  `api/extract.py`, `api/writes.py`) rather than by rigid columns, so new event types don't
  require a migration.
- **Row-Level Security** scopes every table to `auth.uid()`. The backend never uses a
  service-role key for user-facing reads — `api/deps.py` mints a fresh Postgres client per
  request, authenticated with the caller's own bearer token, so tenant isolation is enforced
  by Postgres itself, not by application-layer `WHERE` clauses that a future bug could omit.

## Backend design

```
api/
├── index.py      # FastAPI app assembly, CORS, router mounting
├── deps.py       # Auth (JWT verification), per-request DB client, OpenRouter client
├── gardens.py    # Read model: joins plantings ⋈ plants ⋈ containers ⋈ events per garden
├── writes.py     # Mutations: create/update gardens, plantings, containers, events
├── chat.py       # LLM-backed assistant: reads intent, proposes event create/edit ops
├── extract.py    # LLM-backed structured extraction: freeform note → typed event drafts
└── hardiness.py  # USDA-ARS PHZM geospatial lookup for a garden's hardiness zone
```

A few things worth calling out:

- **Ownership is verified once, structurally.** `verify_garden_ownership()` in `deps.py` is a
  single dependency every mutating route calls before touching data — write endpoints never
  trust a client-supplied `garden_id` without re-checking it against the authenticated user.
- **Every response shape is a Pydantic model.** Request bodies, LLM outputs, and third-party
  API responses (USDA hardiness zone lookup, OpenRouter) are all parsed into typed models with
  bounded field lengths (`ChatMessage.content` capped at 4000 chars, `ExtractRequest.note` at
  10000) before they touch business logic.
- **LLM output is treated as untrusted input.** `_parse_chat_response()` in `api/chat.py`
  tolerates fenced code blocks, bare JSON, or plain prose from the model, validates the result
  against `ChatModelResponse`, and falls back to a safe default rather than raising on
  malformed output — the same defensive posture applied to any external API.
- **The chat endpoint never lets the model free-write.** Proposed `create_events` /
  `edit_events` from the LLM are re-validated against the same ownership and entity-existence
  checks (`_verify_entity`) that the manual write endpoints use — the model can *suggest* a
  database write, but the API decides whether it's allowed.

## AI integration

Two independent LLM-backed endpoints, both routed through OpenRouter (`api/deps.py`) so the
underlying model is swappable via environment variable with no code change:

| Endpoint | Purpose | Output contract |
|---|---|---|
| `POST /api/extract` | Turn a freeform voice/text note into structured event drafts | `EventDraftList` (Pydantic, JSON-mode) |
| `POST /api/chat` | Conversational assistant grounded in the garden's live event log + client-computed weather/projections | `ChatModelResponse` (reply + proposed event ops) |

Both prompts are constructed server-side with the garden's *actual* known plantings injected
as context (never inventing plant IDs), and both degrade gracefully — a malformed or empty
model response returns a typed 502 rather than propagating a stack trace to the client.

## Repository layout

```
.
├── api/                    # FastAPI backend (see Backend design above)
├── frontend/
│   ├── components/         # React UI
│   ├── hooks/               # useAuth, useGardenData, useWeather — state ownership boundaries
│   ├── lib/                  # Pure functions: projections, calendar, reminders, formatting
│   └── tests/                # node:test unit tests for the pure projection/calendar logic
├── infra/                  # Per-service Dockerfiles
├── tests/                  # Pytest suite for the API (mocked Supabase client, no live DB needed)
├── compose.yaml             # Local dev: api + frontend, hot-reloaded
├── vercel.json               # Serverless deploy: single project, path-based routing
└── pyproject.toml / uv.lock  # Backend dependency management (uv)
```

## Running it locally

```bash
cp .env.example .env   # fill in Supabase + OpenRouter credentials
docker compose up --build
```

- Frontend: <http://localhost:5173> (Vite dev server, proxies `/api/*` to the backend container)
- API: <http://localhost:8000/api/health>

Or run each service natively:

```bash
# API
uv run --group dev uvicorn api.index:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

## Testing

```bash
uv run --group dev pytest        # API: request validation, ownership checks, LLM response parsing
node --test frontend/tests/*.js  # Frontend: pure projection/calendar logic, no DOM required
```

The API test suite (`tests/test_api.py`) mocks the Supabase client at the `.table()` call
boundary rather than hitting a real database — every route's authorization and payload-shaping
logic is exercised in isolation, in milliseconds, with no test fixtures to seed or tear down.

## Design decisions & trade-offs

- **Client-side projection duplication.** `frontend/lib/projections.js` re-implements the same
  fold-over-events logic the backend's read model relies on, so the UI can render optimistically
  without a round trip. The trade-off — two implementations of one algorithm — is deliberate:
  it's a small, pure, well-tested function, and the alternative (blocking every UI update on a
  network call) didn't fit a mobile-first tracker.
- **`jsonb` payload over a wide events table.** Rejected a per-event-type table (one for
  waterings, one for harvests, …) in favor of a single polymorphic log, trading some query
  ergonomics for the ability to add new event types without a migration — appropriate for a
  domain where the event vocabulary is still evolving.
- **RLS over application-layer authorization as the *only* line of defense.** The API still
  checks ownership explicitly (see `verify_garden_ownership`) — defense in depth, not reliance
  on a single layer.

## Roadmap

### TODO: FEAUTURES and IMPROVEMENTS

- [ ] AI improvements

## License

Apache License 2.0 — see [`LICENSE`](LICENSE).
