from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .deps import get_current_user, get_db, verify_garden_ownership

router = APIRouter()


class Record(BaseModel):
    model_config = ConfigDict(extra="allow")


class PlantingCreate(BaseModel):
    container: Record
    planting: Record
    events: list[Record] = Field(default_factory=list)


class EventCreate(Record):
    entity_type: str
    entity_id: str
    event_type: str
    category: str
    source: str
    payload: dict[str, Any] = Field(default_factory=dict)


class GardenUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    location: dict[str, float] | None = None
    notes: str | None = None


def _insert(db, table: str, record: dict[str, Any]) -> dict[str, Any]:
    result = db.table(table).insert([record]).execute()
    return result.data[0]


def _verify_event_entity(db, garden_id: str, event: dict[str, Any]) -> None:
    entity_type = event.get("entity_type")
    entity_id = event.get("entity_id")
    if entity_type == "garden":
        if entity_id != garden_id:
            raise HTTPException(status_code=422, detail="Garden event must target its garden")
        return
    if entity_type not in {"planting", "container"}:
        raise HTTPException(status_code=422, detail="Unsupported event entity type")
    table = "plantings" if entity_type == "planting" else "containers"
    result = (
        db.table(table)
        .select("id")
        .eq("id", entity_id)
        .eq("garden_id", garden_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Event entity not found in garden")


@router.post("/api/gardens/{garden_id}/plantings", status_code=201)
def create_planting(
    garden_id: str,
    request: PlantingCreate,
    user_id: str = Depends(get_current_user),
    db = Depends(get_db),
):
    verify_garden_ownership(db, garden_id, user_id)
    planting = {**request.planting.model_dump(exclude_unset=True), "garden_id": garden_id}
    container = {**request.container.model_dump(exclude_unset=True), "garden_id": garden_id}
    client_container_id = container.pop("id", None)
    client_planting_id = planting.pop("id", None)
    if planting.get("garden_id") != container.get("garden_id"):
        raise HTTPException(status_code=422, detail="Records must belong to the same garden")

    created_container = _insert(db, "containers", container)
    created_planting = _insert(db, "plantings", planting)
    events = []
    for event in request.events:
        event_data = {**event.model_dump(exclude_unset=True), "garden_id": garden_id}
        entity_ids = {
            client_container_id: created_container.get("id"),
            client_planting_id: created_planting.get("id"),
        }
        client_entity_id = event_data.get("entity_id")
        if client_entity_id not in entity_ids or not entity_ids[client_entity_id]:
            raise HTTPException(status_code=422, detail="Setup event targets an unknown created record")
        event_data["entity_id"] = entity_ids[client_entity_id]
        event_data.pop("id", None)
        events.append(_insert(db, "garden_events", event_data))
    return {"container": created_container, "planting": created_planting, "events": events}


@router.post("/api/gardens/{garden_id}/events", status_code=201)
def append_event(
    garden_id: str,
    event: EventCreate,
    user_id: str = Depends(get_current_user),
    db = Depends(get_db),
):
    verify_garden_ownership(db, garden_id, user_id)
    event_data = {**event.model_dump(exclude_unset=True), "garden_id": garden_id}
    event_data.pop("id", None)
    _verify_event_entity(db, garden_id, event_data)
    return {"event": _insert(db, "garden_events", event_data)}


@router.patch("/api/gardens/{garden_id}")
def update_garden(
    garden_id: str,
    update: GardenUpdate,
    user_id: str = Depends(get_current_user),
    db = Depends(get_db),
):
    verify_garden_ownership(db, garden_id, user_id)
    values = update.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=422, detail="At least one garden field is required")
    result = db.table("gardens").update(values).eq("id", garden_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Garden not found")
    return {"garden": result.data[0]}