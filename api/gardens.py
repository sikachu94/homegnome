from fastapi import APIRouter, Depends

from .deps import get_current_user, get_db

router = APIRouter()

# If a user has never explicitly created a garden, we don't make them stop
# and set one up — we default them into a "whole house" garden instead.
# `whole_house` is a real value in gardens.type's check constraint.
DEFAULT_GARDEN = {"name": "My Home", "type": "whole_house"}


def _ensure_default_garden(db, user_id: str) -> dict:
    """Every container/planting needs a garden row to hang off of (that's
    how row-level security is scoped), but the *person* using the app should
    never have to think about "gardens" if all they have is a windowsill
    basil plant. If they have zero gardens, silently create the default one
    and use that instead of forcing setup first.
    """
    result = db.table("gardens").insert([{**DEFAULT_GARDEN, "user_id": user_id}]).execute()
    return result.data[0]


def _flatten_planting(item: dict) -> dict:
    """`plantings.plant_id` points at the normalized species catalog
    (`plants`), but the rest of the app (and the AI prompts) work in plain
    species names. Flatten the embedded `plants` row into `species` (plus a
    richer `species_info` blob) so callers don't need to know about the
    join.
    """
    species = item.pop("plants", None) or {}
    item["species"] = species.get("plant_name")
    item["species_info"] = {
        "harvest_type": species.get("harvest_type"),
        "life_cycle_type": species.get("life_cycle_type"),
        "latin_name": species.get("latin_name"),
        "variety": species.get("variety"),
    }
    return item


@router.get("/api/gardens")
def list_gardens(user_id: str = Depends(get_current_user), db = Depends(get_db)):
    gardens = (
        db.table("gardens")
        .select("id, name, type, location, timezone, established_at, notes")
        .eq("user_id", user_id)
        .execute()
        .data
    )

    if not gardens:
        gardens = [_ensure_default_garden(db, user_id)]

    garden_ids = [garden["id"] for garden in gardens]

    plantings_raw = (
        db.table("plantings")
        .select("*, plants(plant_name, harvest_type, life_cycle_type, latin_name, variety)")
        .in_("garden_id", garden_ids)
        .execute()
        .data
    )
    plantings = [_flatten_planting(dict(item)) for item in plantings_raw]
    containers = db.table("containers").select("*").in_("garden_id", garden_ids).execute().data
    events = db.table("garden_events").select("*").in_("garden_id", garden_ids).execute().data

    return {
        "gardens": [
            {
                **garden,
                "plantings": [item for item in plantings if item.get("garden_id") == garden["id"]],
                "containers": [item for item in containers if item.get("garden_id") == garden["id"]],
                "events": [item for item in events if item.get("garden_id") == garden["id"]],
            }
            for garden in gardens
        ]
    }