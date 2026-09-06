import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from .deps import EXTRACT_MODEL, get_current_user, get_db, mistral_client, verify_garden_ownership

router = APIRouter()


class EventDraft(BaseModel):
    planting_id: Optional[str] = Field(
        default=None, description="ID from the known plantings list, or null for garden-level events."
    )
    event_type: str = Field(description="Allowed types: watering, harvest, pest_sighting, rainfall, etc.")
    category: str = Field(description="E.g., measurement, action, observation, lifecycle")
    payload: Dict[str, Any] = Field(
        default_factory=dict, description="Matching fields for the specific event type."
    )
    note: Optional[str] = Field(
        default=None, description="Short human-readable note for anything not captured structurally."
    )


class EventDraftList(BaseModel):
    """Wraps the drafts in an object — most JSON-schema/JSON-mode setups expect an object at the root."""

    drafts: List[EventDraft] = Field(default_factory=list)


class ExtractRequest(BaseModel):
    note: str = Field(min_length=1, max_length=10000)
    garden_id: str


@router.post("/api/extract")
def extract_events(req: ExtractRequest, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    verify_garden_ownership(db, req.garden_id, user_id)

    # 1. Fetch this garden's active plantings to give the model as context.
    # The DB stores the canonical species reference by plant_id and keeps the
    # catalog in the `plants` table, so keep the join visible to the model.
    plantings_res = (
        db.table("plantings")
        .select("id, nickname, plant_id, plants(id, plant_name, latin_name)")
        .eq("garden_id", req.garden_id)
        .execute()
    )
    plantings_context = "\n".join(
        f"{p['id']} | {p['nickname']} | {((p.get('plants') or {}).get('plant_name') or p.get('species') or p.get('plant_id'))}"
        for p in plantings_res.data
    )

    schema = EventDraftList.model_json_schema()
    system_instruction = f"""You convert a home gardener's freeform note into structured event-log entries for myGnomie, a garden tracker.

Known plantings (id | nickname | species):
{plantings_context}

Respond with ONLY a JSON object matching this schema, no prose, no markdown fences:
{json.dumps(schema)}

For garden-level event types (e.g. rainfall, frost) set "planting_id" to null.
Never propose photo_log from text alone — photos are attached by the user directly, not inferred.
If the note describes more than one distinct thing, include multiple items in "drafts".
If nothing matches a known planting or event type, return {{"drafts": []}}."""

    # 2. Call Mistral in JSON mode
    try:
        response = mistral_client.chat.complete(
            model=EXTRACT_MODEL,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": req.note},
            ],
            response_format={"type": "json_object"},
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Extraction provider is unavailable")

    raw = response.choices[0].message.content

    # 3. Validate the model's output against our schema. Also tolerates a
    # bare JSON array in case the model ignores the "wrap in drafts" instruction.
    try:
        parsed = EventDraftList.model_validate_json(raw)
    except ValidationError:
        try:
            parsed = EventDraftList.model_validate({"drafts": json.loads(raw)})
        except Exception:
            raise HTTPException(status_code=502, detail="Model returned a response that didn't match the expected schema.")

    return {"drafts": [d.model_dump() for d in parsed.drafts]}
