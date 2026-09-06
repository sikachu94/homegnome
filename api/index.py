import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .chat import router as chat_router
from .extract import router as extract_router
from .gardens import router as gardens_router

app = FastAPI(docs_url="/api/docs", openapi_url="/api/openapi.json")

# Comma-separated list, e.g. "http://localhost:5173,https://your-app.vercel.app"
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
allowed_origins = [origin.strip() for origin in _allowed_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(extract_router)
app.include_router(gardens_router)


@app.get("/api/health")
def health():
    return {"ok": True}
