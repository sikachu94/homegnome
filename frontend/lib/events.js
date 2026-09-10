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

// Event types that render as an andon-style alert regardless of any
// severity value in their payload — severity isn't a reliable enum since
// the AI extractor doesn't enforce one (see the event log redesign plan's
// decision #1). Single source of truth: EventIcon's stamp color, the log's
// day-rollup highlighting, and each entry's row styling all read from this
// instead of each keeping their own copy.
export const ALERT_EVENT_TYPES = new Set(["pest_sighting", "disease_sighting"]);
export const isAlertEvent = (eventType) => ALERT_EVENT_TYPES.has(eventType);

// Plain-language stand-ins for raw event_type strings. Anywhere a person
// reads the log, they should see "Watered" and "Pest spotted", not
// "watering" or "pest_sighting" with underscores swapped for spaces.
export const EVENT_TYPE_LABELS = {
  watering: "Watered",
  growth_measurement: "Measurement taken",
  harvest: "Harvested",
  pest_sighting: "Pest spotted",
  disease_sighting: "Disease spotted",
  stage_change: "Growth stage changed",
  planting_ended: "Planting ended",
  photo_log: "Photo added",
  rainfall: "Rain",
  frost: "Frost",
  container_setup: "Container set up",
  planting_setup: "Planting added",
  relocated: "Moved",
  soil_amended: "Soil changed",
  transplanted: "Transplanted",
};

export function labelForEventType(eventType) {
  return EVENT_TYPE_LABELS[eventType] || eventType.replace(/_/g, " ");
}

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

/**
 * Builds a minimal, ready-to-persist event for one-tap quick actions
 * (watering, harvest, photo_log) — no note, empty payload by default.
 * `extra` lets callers attach things buildEvent's draft shape doesn't cover,
 * e.g. `{ media: [dataUrl] }` for a quick photo, or a payload override.
 *
 * Deliberately separate from buildEvent: quick actions always know their
 * target entity directly (no draft.planting_id / scopeOf inference needed
 * from free-text extraction), and always start from an empty payload since
 * there's no note for the AI to have parsed fields out of.
 */
export function quickLogEvent(eventType, entityId, gardenId, extra = {}) {
  const meta = EVENT_TYPES[eventType];
  const scope = meta?.scope || "planting";
  return {
    id: uid("evt"),
    timestamp: new Date().toISOString(),
    garden_id: gardenId,
    entity_type: scope === "garden" ? "garden" : "planting",
    entity_id: scope === "garden" ? gardenId : entityId,
    category: meta?.category || "action",
    source: "self",
    event_type: eventType,
    payload: {},
    confidence: "observed",
    ...extra,
  };
}

/**
 * Short human-readable fragment of a saved event's payload, for the
 * subtitle line under a log entry — e.g. "0.5L, by hand" or "Aphids ·
 * moderate". Returns null when the payload has nothing worth surfacing
 * (quick-tap actions log with an empty payload on purpose).
 */
export function describeEventPayload(eventType, payload = {}) {
  switch (eventType) {
    case "watering":
      return payload.amount_l ? `${payload.amount_l}L${payload.method ? `, by ${payload.method}` : ""}` : payload.method || null;
    case "harvest":
      return payload.quantity ? `${payload.quantity}${payload.unit ? ` ${payload.unit}` : ""}${payload.quality ? `, ${payload.quality}` : ""}` : payload.quality || null;
    case "pest_sighting":
      return payload.pest ? `${payload.pest}${payload.severity ? ` · ${payload.severity}` : ""}` : payload.severity || null;
    case "disease_sighting":
      return payload.disease ? `${payload.disease}${payload.severity ? ` · ${payload.severity}` : ""}` : payload.severity || null;
    case "rainfall":
      return payload.amount_mm ? `${payload.amount_mm}mm` : null;
    case "frost":
      return payload.severity || null;
    case "growth_measurement":
      return payload.metric ? `${payload.metric}: ${payload.value ?? "—"}${payload.unit ? ` ${payload.unit}` : ""}` : null;
    default:
      return null;
  }
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
