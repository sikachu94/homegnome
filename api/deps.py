import os

from dotenv import load_dotenv
from fastapi import Header, HTTPException
from mistralai.client import Mistral
from supabase import Client, create_client

# Vercel sets VERCEL=1 in its runtime; only load a local .env file outside of it.
if not os.environ.get("VERCEL"):
    load_dotenv()


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Set it in your .env file locally, or in your Vercel project's "
            f"Environment Variables settings for deployed environments."
        )
    return value


SUPABASE_URL = _require_env("SUPABASE_URL")
SUPABASE_ANON_KEY = _require_env("SUPABASE_ANON_KEY")
MISTRAL_API_KEY = _require_env("MISTRAL_API_KEY")

# Overridable per-environment without a code change.
CHAT_MODEL = os.environ.get("MISTRAL_CHAT_MODEL", "mistral-medium-latest")
EXTRACT_MODEL = os.environ.get("MISTRAL_EXTRACT_MODEL", "ministral-8b-latest")

_auth_client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
mistral_client = Mistral(api_key=MISTRAL_API_KEY)


def _bearer_token(authorization: str) -> str:
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Malformed Authorization header")
    return parts[1]


def get_current_user(authorization: str = Header(...)) -> str:
    token = _bearer_token(authorization)
    try:
        user_response = _auth_client.auth.get_user(token)  # stateless call, token passed explicitly
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")
    if not user_response or not user_response.user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_response.user.id


def get_db(authorization: str = Header(...)) -> Client:
    """One Supabase client per request, authed as the caller. Never shared."""
    token = _bearer_token(authorization)
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(token)
    return client


def verify_garden_ownership(db: Client, garden_id: str, user_id: str) -> None:
    result = (
        db.table("gardens").select("id").eq("id", garden_id).eq("user_id", user_id).limit(1).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Garden not found")