## Local development with Docker

Copy `.env.example` to `.env` and fill in the Supabase and Mistral values. Then start both services:

```bash
docker compose up --build
```

Open the frontend at <http://localhost:5173>. The API health check is available at <http://localhost:8000/api/health>.

The frontend container uses Vite's proxy to route `/api/*` requests to the `api` container. Source files are mounted for frontend hot reload. Stop the stack with:

```bash
docker compose down
```
