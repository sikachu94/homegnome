import { uid, daysAgo } from "./format.js";

// TEMPORARY: until step 2 (real gardens/plantings/events CRUD) lands, the
// garden this app operates on comes from an env var, and the state below
// seeds a demo garden in localStorage. See hooks/useGardenData.js.
export const GARDEN_ID = import.meta.env.VITE_DEV_GARDEN_ID || "garden_poc_1";

export const DEFAULT_GARDEN = { name: "My garden", type: "balcony", notes: "", location: null, label: null };

export const SEED_CONTAINERS = [
  { id: "container_seed_1", garden_id: GARDEN_ID, name: "Balcony rail pot", type: "pot", mobility: "movable", material: "terracotta", volume_l: 15, created_at: daysAgo(34) },
  { id: "container_seed_2", garden_id: GARDEN_ID, name: "Kitchen window pot", type: "pot", mobility: "movable", material: "plastic", volume_l: 4, created_at: daysAgo(16) },
];

export const SEED_PLANTINGS = [
  { id: "planting_seed_1", species: "Tomato", nickname: "Balcony tomato", started_at: daysAgo(34) },
  { id: "planting_seed_2", species: "Basil", nickname: "Kitchen basil", started_at: daysAgo(16) },
];

export const SEED_EVENTS = [
  { id: uid("evt"), timestamp: daysAgo(34), garden_id: GARDEN_ID, entity_type: "container", entity_id: "container_seed_1", category: "lifecycle", source: "self", event_type: "container_setup", payload: { initial_placement: "South-facing balcony rail", initial_soil_composition: [{ component: "Potting mix", percent: 70 }, { component: "Compost", percent: 20 }, { component: "Perlite", percent: 10 }], sun_exposure_hours: 7 }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(16), garden_id: GARDEN_ID, entity_type: "container", entity_id: "container_seed_2", category: "lifecycle", source: "self", event_type: "container_setup", payload: { initial_placement: "Kitchen windowsill", initial_soil_composition: [{ component: "Standard potting mix", percent: 100 }], sun_exposure_hours: 4 }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(34), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_1", category: "lifecycle", source: "self", event_type: "planting_setup", payload: { container_id: "container_seed_1", entry_stage: "seedling", acquisition_source: "purchased_seedling" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(16), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_2", category: "lifecycle", source: "self", event_type: "planting_setup", payload: { container_id: "container_seed_2", entry_stage: "seedling", acquisition_source: "purchased_seedling" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(20), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_1", category: "lifecycle", source: "self", event_type: "stage_change", payload: { from_stage: "seedling", to_stage: "vegetative" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(6), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_1", category: "lifecycle", source: "self", event_type: "stage_change", payload: { from_stage: "vegetative", to_stage: "flowering" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(2), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_1", category: "action", source: "self", event_type: "watering", payload: { amount_l: 0.5, method: "hand" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(1), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_2", category: "action", source: "self", event_type: "watering", payload: { amount_l: 0.2, method: "hand" }, confidence: "observed" },
];
