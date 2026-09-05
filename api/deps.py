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

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
mistral_client = Mistral(api_key=MISTRAL_API_KEY)


def get_current_user(authorization: str = Header(...)) -> str:
    """Validates the Supabase-issued bearer token and returns the user id."""
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Malformed Authorization header")
    token = parts[1]

    try:
        user_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")

    if not user_response or not user_response.user:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user_response.user.id


def verify_garden_ownership(garden_id: str, user_id: str) -> None:
    """
    Confirms the requesting user owns this garden before any read/write.

    Assumes a `gardens` table with `id` and `user_id` columns — adjust the
    table/column names here if your schema differs. Without this check,
    any authenticated user could pass any garden_id and read/write it.
    """
    result = (
        supabase.table("gardens")
        .select("id")
        .eq("id", garden_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Garden not found")
