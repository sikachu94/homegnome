from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from . import hardiness
from .deps import get_current_user, get_db, verify_garden_ownership

router = APIRouter()


class Record(BaseModel):
    model_config = ConfigDict(extra="allow")


class PlantingCreate(BaseModel):
    container: Record | None = None
    container_id: str | None = None
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


def _resolve_plant_id(db, record: dict[str, Any]) -> str:
    plant_id = record.get("plant_id")
    if plant_id:
        return plant_id

    species = record.get("species")
    if not species:
        raise HTTPException(status_code=422, detail="Planting must include a species or plant_id")

    result = (
        db.table("plants")
        .select("id")
        .eq("plant_name", species)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=422, detail=f"Unknown plant species in reference catalog: {species}")
    return result.data[0]["id"]


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


def _build_default_setup_events(garden_id: str, container_id: str, planting_id: str, container_payload: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    events = [
        {
            "garden_id": garden_id,
            "entity_type": "container",
            "entity_id": container_id,
            "event_type": "container_setup",
            "category": "lifecycle",
            "source": "self",
            "payload": {
                "initial_placement": (container_payload or {}).get("placement") or "Unspecified",
                "initial_soil_composition": (container_payload or {}).get("soil_composition") or [],
            },
            "confidence": "observed",
        },
        {
            "garden_id": garden_id,
            "entity_type": "planting",
            "entity_id": planting_id,
            "event_type": "planting_setup",
            "category": "lifecycle",
            "source": "self",
            "payload": {
                "container_id": container_id,
                "entry_stage": (container_payload or {}).get("entry_stage") or "seedling",
                "acquisition_source": (container_payload or {}).get("acquisition_source") or "unknown",
            },
            "confidence": "observed",
        },
    ]
    return events


def _build_default_planting_event(garden_id: str, container_id: str, planting_id: str, planting_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = planting_payload or {}
    return {
        "garden_id": garden_id,
        "entity_type": "planting",
        "entity_id": planting_id,
        "event_type": "planting_setup",
        "category": "lifecycle",
        "source": "self",
        "payload": {
            "container_id": container_id,
            "entry_stage": payload.get("entry_stage") or "seedling",
            "acquisition_source": payload.get("acquisition_source") or "unknown",
        },
        "confidence": "observed",
    }


@router.post("/api/gardens/{garden_id}/plantings", status_code=201)
def create_planting(
    garden_id: str,
    request: PlantingCreate,
    user_id: str = Depends(get_current_user),
    db = Depends(get_db),
):
    verify_garden_ownership(db, garden_id, user_id)
    planting = {**request.planting.model_dump(exclude_unset=True), "garden_id": garden_id}

    if request.container_id:
        created_container = (
            db.table("containers")
            .select("*")
            .eq("id", request.container_id)
            .eq("garden_id", garden_id)
            .limit(1)
            .execute()
        )
        if not created_container.data:
            raise HTTPException(status_code=404, detail="Container not found in garden")
        created_container = created_container.data[0]
        client_container_id = request.container_id
    else:
        if request.container is None:
            raise HTTPException(status_code=422, detail="Either container_id or a new container payload is required")
        container = {**request.container.model_dump(exclude_unset=True), "garden_id": garden_id}
        client_container_id = container.pop("id", None)
        if planting.get("garden_id") != container.get("garden_id"):
            raise HTTPException(status_code=422, detail="Records must belong to the same garden")
        created_container = _insert(db, "containers", container)

    client_planting_id = planting.pop("id", None)
    planting["container_id"] = created_container.get("id")
    plant_id = _resolve_plant_id(db, planting)
    planting["plant_id"] = plant_id
    planting.pop("species", None)
    planting.pop("species_info", None)

    created_planting = _insert(db, "plantings", planting)
    logger_events = []
    explicit_events = list(request.events)
    if not explicit_events:
        planting_payload = request.planting.model_dump(exclude_unset=True)
        if request.container_id:
            explicit_events = [_build_default_planting_event(
                garden_id,
                created_container.get("id"),
                created_planting.get("id"),
                planting_payload,
            )]
        else:
            explicit_events = _build_default_setup_events(
                garden_id,
                created_container.get("id"),
                created_planting.get("id"),
                {
                    "placement": request.container.model_dump(exclude_unset=True).get("placement"),
                    "soil_composition": request.container.model_dump(exclude_unset=True).get("soil_composition"),
                    "entry_stage": planting_payload.get("entry_stage"),
                    "acquisition_source": planting_payload.get("acquisition_source"),
                },
            )

    for event in explicit_events:
        if hasattr(event, "model_dump"):
            event_data = {**event.model_dump(exclude_unset=True), "garden_id": garden_id}
        else:
            event_data = {**event, "garden_id": garden_id}
        entity_ids = {
            client_container_id: created_container.get("id"),
            client_planting_id: created_planting.get("id"),
        }
        client_entity_id = event_data.get("entity_id")
        if client_entity_id in {created_container.get("id"), created_planting.get("id")}:
            event_data["entity_id"] = client_entity_id
        elif client_entity_id not in entity_ids or not entity_ids[client_entity_id]:
            raise HTTPException(status_code=422, detail="Setup event targets an unknown created record")
        else:
            event_data["entity_id"] = entity_ids[client_entity_id]
        payload = event_data.get("payload")
        if event_data.get("entity_type") == "planting" and isinstance(payload, dict):
            payload_container_id = payload.get("container_id")
            if payload_container_id in entity_ids and entity_ids[payload_container_id]:
                payload["container_id"] = entity_ids[payload_container_id]
        event_data.pop("id", None)
        logger_events.append(_insert(db, "garden_events", event_data))
    return {"container": created_container, "planting": created_planting, "events": logger_events}


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
    if "location" not in values:
        return {"garden": result.data[0]}

    location = values.get("location") or {}
    zone_data = None
    if isinstance(location, dict) and location.get("lat") is not None and location.get("lng") is not None:
        zone_data = hardiness.lookup_hardiness_zone(location["lat"], location["lng"])
    zone_values = {
        "hardiness_zone": zone_data.get("zone") if zone_data else None,
        "hardiness_zone_temp_range_f": zone_data.get("temp_range_f") if zone_data else None,
        "hardiness_zone_updated_at": datetime.now(timezone.utc).isoformat() if zone_data else None,
    }
    enriched = db.table("gardens").update(zone_values).eq("id", garden_id).execute()
    return {"garden": enriched.data[0] if enriched.data else {**result.data[0], **zone_values}}