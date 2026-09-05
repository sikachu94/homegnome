from typing import List, Dict
from fastapi import Depends
from pydantic import BaseModel
from google.genai import types


class ChatRequest(BaseModel):
    garden_id: str
    messages: List[Dict[str, str]] # [{'role': 'user', 'content': '...'}, ...]

@app.post("/api/chat")
def garden_chat(req: ChatRequest, user_id: str = Depends(get_current_user)):
    # 1. Fetch current projections and recent events from Supabase
    # (In a real app, you'd fetch from your projections table/logic here)
    events = supabase.table("garden_events").select("*").eq("garden_id", req.garden_id).order("timestamp", desc=True).limit(20).execute()
    
    system_instruction = f"""
    You are homeGnome, a home gardening assistant. 
    Answer using the gardener's data. Be concise and practical.
    RECENT EVENTS: {events.data}
    """

    # 2. Format history for Gemini
    formatted_history = [
        types.Content(role=m["role"] if m["role"] == "user" else "model", parts=[types.Part.from_text(text=m["content"])])
        for m in req.messages
    ]

    # 3. Generate response
    response = ai_client.models.generate_content(
        model='gemini-2.5-flash',
        contents=formatted_history,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction
        )
    )

    return {"reply": response.text}