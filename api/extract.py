from typing import Optional, Dict, Any
from fastapi import Depends
from pydantic import BaseModel, Field
from google.genai import types

class EventDraft(BaseModel):
    planting_id: Optional[str] = Field(description="ID from the known plantings list, or null for garden-level events.")
    event_type: str = Field(description="Allowed types: watering, harvest, pest_sighting, rainfall, etc.")
    category: str = Field(description="E.g., measurement, action, observation, lifecycle")
    payload: Dict[str, Any] = Field(description="Matching fields for the specific event type.")
    note: Optional[str] = Field(description="Short human-readable note for anything not captured structurally.")

class ExtractRequest(BaseModel):
    note: str
    garden_id: str

@app.post("/api/extract")
def extract_events(req: ExtractRequest, user_id: str = Depends(get_current_user)):
    # 1. Fetch user's active plantings from Supabase to provide as context
    plantings_res = supabase.table("plantings").select("id, nickname, species").eq("garden_id", req.garden_id).execute()
    plantings_context = "\n".join([f"{p['id']} | {p['nickname']} | {p['species']}" for p in plantings_res.data])

    system_instruction = f"""
    You convert a freeform note into structured event-log entries for a garden tracker.
    Known plantings:
    {plantings_context}
    """

    # 2. Call Gemini with strict JSON schema enforcement
    response = ai_client.models.generate_content(
        model='gemini-2.5-flash',
        contents=req.note,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=list[EventDraft],
        ),
    )
    
    return {"drafts": response.text} # Returns a guaranteed JSON array string