## Local development

The repository is split into a Vite frontend, a FastAPI API, and infrastructure
configuration. The frontend lives in `frontend/`; the Vercel-compatible API
entrypoints remain in `api/`.

### Docker

Copy `.env.example` to `.env` and fill in the Supabase and OpenRouter values. Then start both services:

```bash
docker compose up --build
```

Open the frontend at <http://localhost:5173>. The API health check is available at <http://localhost:8000/api/health>.

The frontend container uses Vite's proxy to route `/api/*` requests to the `api` container. Frontend source files are mounted for hot reload. Stop the stack with:

```bash
docker compose down
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### API tests

```bash
uv run --group dev pytest
```
