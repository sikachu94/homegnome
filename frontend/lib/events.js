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
EVENT_TYPES.garden_note = { category: "observation", scope: "garden", fields: "note" };

EVENT_TYPE_LABELS.garden_note = "Garden note";

MANUAL_ENTRY_TYPES.push("garden_note");
MANUAL_ENTRY_LABELS.garden_note = "Garden note";
MANUAL_ENTRY_FIELDS.garden_note = [];

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

// The manual log-entry form on the Log tab offers these as its type chips,
// in this order. Present-tense/type-name labels ("Watering", "Pest") on
// purpose — distinct from EVENT_TYPE_LABELS above, which is past-tense for
// describing something that already happened in the log rows.
export const MANUAL_ENTRY_TYPES = [
  "watering",
  "harvest",
  "growth_measurement",
  "pest_sighting",
  "disease_sighting",
  "photo_log",
];

export const MANUAL_ENTRY_LABELS = {
  watering: "Watering",
  harvest: "Harvest",
  growth_measurement: "Measurement",
  pest_sighting: "Pest",
  disease_sighting: "Disease",
  photo_log: "Photo",
};

// Field definitions for the manual log-entry form. Each field is
// { key, label, kind: "number" | "text" | "select", options?, placeholder? }.
export const MANUAL_ENTRY_FIELDS = {
  watering: [
    { key: "amount_l", label: "Amount (litres)", kind: "number" },
    { key: "method", label: "Method", kind: "select", options: ["hand", "drip", "sprinkler"] },
  ],
  harvest: [
    { key: "quantity", label: "Quantity", kind: "number" },
    { key: "unit", label: "Unit", kind: "select", options: ["g", "kg", "pieces"] },
    { key: "quality", label: "Quality", kind: "select", options: ["poor", "fair", "good", "excellent"] },
    { key: "harvest_method", label: "Method", kind: "select", options: ["hand-picked", "cut", "pulled"] },
  ],
  growth_measurement: [
    { key: "metric", label: "What are you measuring?", kind: "text", placeholder: "e.g. height" },
    { key: "value", label: "Value", kind: "number" },
    { key: "unit", label: "Unit", kind: "text", placeholder: "e.g. cm" },
  ],
  pest_sighting: [
    { key: "pest", label: "Pest", kind: "text", placeholder: "e.g. aphids" },
    { key: "severity", label: "Severity", kind: "select", options: ["light", "moderate", "severe"] },
    { key: "affected_area", label: "Affected area", kind: "text", placeholder: "optional" },
  ],
  disease_sighting: [
    { key: "disease", label: "Disease", kind: "text", placeholder: "e.g. powdery mildew" },
    { key: "severity", label: "Severity", kind: "select", options: ["light", "moderate", "severe"] },
  ],
  photo_log: [],
};

/** Turns a parsed AI draft into a full event-log entry ready to persist. */
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
 * Builds one ready-to-persist event per target planting for the manual
 * log-entry form — the multi-plant, structured-fields counterpart to
 * quickLogEvent above.
 */
export function buildManualEvents({ eventType, gardenId, plantingIds, payload = {}, note, media }) {
  const meta = EVENT_TYPES[eventType];
  return plantingIds.map((plantingId) => ({
    id: uid("evt"),
    timestamp: new Date().toISOString(),
    garden_id: gardenId,
    entity_type: "planting",
    entity_id: plantingId,
    category: meta?.category || "action",
    source: "self",
    event_type: eventType,
    payload,
    note: note || undefined,
    media: media?.length ? media : undefined,
    confidence: "observed",
  }));
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
      return payload.quantity
        ? `${payload.quantity}${payload.unit ? ` ${payload.unit}` : ""}${payload.quality ? `, ${payload.quality}` : ""}${payload.harvest_method ? ` (${payload.harvest_method})` : ""}`
        : payload.quality || payload.harvest_method || null;
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
    if (event.entity_type === "garden") return "Garden";
    if (event.entity_type === "container") {
    const container = containers.find((item) => item.id === event.entity_id);
    if (!container) return "Unknown container";
    const typedName = [container.material, container.type, "container"].filter(Boolean).join(" ");
    return typedName || container.name || "Unknown container";
  }
  return plantings.find((planting) => planting.id === event.entity_id)?.nickname || "Unknown planting";
}

export function buildManualEvents({ eventType, gardenId, plantingIds, payload = {}, note, media }) {
  const meta = EVENT_TYPES[eventType];
  if (scopeOf(eventType) === "garden") {
    return [{
      id: uid("evt"), timestamp: new Date().toISOString(), garden_id: gardenId,
      entity_type: "garden", entity_id: gardenId,
      category: meta?.category || "observation", source: "self", event_type: eventType,
      payload, note: note || undefined, media: media?.length ? media : undefined, confidence: "observed",
    }];
  }
  return plantingIds.map((plantingId) => ({
    id: uid("evt"), timestamp: new Date().toISOString(), garden_id: gardenId,
    entity_type: "planting", entity_id: plantingId,
    category: meta?.category || "action", source: "self", event_type: eventType,
    payload, note: note || undefined, media: media?.length ? media : undefined, confidence: "observed",
  }));
}