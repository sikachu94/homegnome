from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .deps import CHAT_MODEL, get_current_user, mistral_client, supabase, verify_garden_ownership

router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    garden_id: str
    messages: List[ChatMessage] = Field(min_length=1, max_length=50)
    # Optional client-computed context (per-plant projections, species reference
    # data, live weather). The backend has no independent access to weather —
    # it only exists in the browser — so the frontend supplies it here.
    context: str | None = Field(default=None, max_length=20000)


@router.post("/api/chat")
def garden_chat(req: ChatRequest, user_id: str = Depends(get_current_user)):
    verify_garden_ownership(req.garden_id, user_id)

    # 1. Fetch recent events from Supabase (source of truth, always fresh)
    events = (
        supabase.table("garden_events")
        .select("*")
        .eq("garden_id", req.garden_id)
        .order("timestamp", desc=True)
        .limit(20)
        .execute()
    )

    system_prompt = (
        "You are myGnomie, a home gardening assistant. "
        "Answer using the gardener's data below. Be concise, warm, and practical. "
        "If the data doesn't have enough information to answer confidently, say so plainly instead of guessing.\n\n"
    )
    if req.context:
        system_prompt += req.context + "\n\n"
    system_prompt += f"RECENT EVENT LOG (most recent first): {events.data}"

    # 2. Format history for Mistral (OpenAI-style role/content dicts)
    mistral_messages = [{"role": "system", "content": system_prompt}]
    for message in req.messages:
        mistral_messages.append(message.model_dump())

    # 3. Generate response
    try:
        response = mistral_client.chat.complete(
            model=CHAT_MODEL,
            messages=mistral_messages,
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Assistant provider is unavailable")

    reply = response.choices[0].message.content
    return {"reply": reply}