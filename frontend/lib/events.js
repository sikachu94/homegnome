import { uid } from "./format.js";

export const EVENT_TYPES = {
  watering: { category: "action", scope: "planting", fields: "amount_l?, method" },
  growth_measurement: { category: "measurement", scope: "planting", fields: "metric, value, unit" },
  harvest: { category: "measurement", scope: "planting", fields: "quantity, unit, quality?, harvest_method?" },
  pest_sighting: { category: "observation", scope: "planting", fields: "pest, severity, affected_area?" },
  disease_sighting: { category: "observation", scope: "planting", fields: "disease, severity" },
  stage_change: { category: "lifecycle", scope: "planting", fields: "from_stage, to_stage" },
  planting_ended: { category: "lifecycle", scope: "planting", fields: "end_reason" },
  photo_log: { category: "observation", scope: "planting", fields: "(no payload — just a photo)" },
  rainfall: { category: "measurement", scope: "garden", fields: "amount_mm" },
  frost: { category: "observation", scope: "garden", fields: "severity?" },
};

export const scopeOf = (eventType) => EVENT_TYPES[eventType]?.scope || "planting";

/** Turns a parsed draft into a full event-log entry ready to persist. */
export function buildEvent(draft, gardenId) {
  const scope = scopeOf(draft.event_type);
  return {
    id: uid("evt"),
    timestamp: new Date().toISOString(),
    garden_id: gardenId,
    entity_type: scope === "garden" ? "garden" : "planting",
    entity_id: scope === "garden" ? gardenId : draft.planting_id,
    category: draft.category,
    source: "self",
    event_type: draft.event_type,
    payload: draft.payload || {},
    note: draft.note || undefined,
    media: draft.media?.length ? draft.media : undefined,
    confidence: "observed",
  };
}

/** Human-readable label for an event's subject, for the recent-log list. */
export function labelForEntity(event, plantings, containers) {
  if (event.entity_type === "garden") return "Weather";
  if (event.entity_type === "container") {
    const container = containers.find((item) => item.id === event.entity_id);
    if (!container) return "Unknown container";
    const typedName = [container.material, container.type, "container"].filter(Boolean).join(" ");
    return typedName || container.name || "Unknown container";
  }
  return plantings.find((planting) => planting.id === event.entity_id)?.nickname || "Unknown planting";
}
