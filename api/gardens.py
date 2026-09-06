from fastapi import APIRouter, Depends

from .deps import get_current_user, get_db

router = APIRouter()


@router.get("/api/gardens")
def list_gardens(user_id: str = Depends(get_current_user), db = Depends(get_db)):
    gardens = (
        db.table("gardens")
        .select("id, name, type, location, timezone, established_at, notes")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    garden_ids = [garden["id"] for garden in gardens]

    plantings = []
    containers = []
    events = []
    if garden_ids:
        plantings = db.table("plantings").select("*").in_("garden_id", garden_ids).execute().data
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
