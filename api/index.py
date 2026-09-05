import os
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from supabase import create_client, Client
from google import genai
from google.genai import types

app = FastAPI(docs_url="/api/docs", openapi_url="/api/openapi.json")

# Initialize Clients
supabase: Client = create_client(
    os.environ.get("SUPABASE_URL"), 
    os.environ.get("SUPABASE_ANON_KEY")
)
ai_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# Auth Dependency
def get_current_user(authorization: str = Header(...)):
    try:
        token = authorization.split(" ")[1]
        user = supabase.auth.get_user(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")
    

