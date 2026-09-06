import { useState, useEffect, useCallback } from "react";
import { storageGet, storageSet } from "../lib/storage.js";
import { uid } from "../lib/format.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { GARDEN_ID, DEFAULT_GARDEN, SEED_CONTAINERS, SEED_PLANTINGS, SEED_EVENTS } from "../lib/seedData.js";

/**
 * Owns plantings/containers/events/garden state and their persistence.
 * TEMPORARY: persistence is localStorage-only (see lib/storage.js) until
 * step 2 (real gardens/plantings/events CRUD against the backend) lands —
 * every `persist`/`persistGarden` call below is the seam that step will
 * replace with API calls.
 */
export function useGardenData() {
  const [plantings, setPlantings] = useState(null);
  const [containers, setContainers] = useState(null);
  const [events, setEvents] = useState(null);
  const [garden, setGarden] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      let p, c, e, g;
      try { const r = await storageGet("plantings"); p = r ? JSON.parse(r.value) : SEED_PLANTINGS; } catch { p = SEED_PLANTINGS; }
      try { const r = await storageGet("containers"); c = r ? JSON.parse(r.value) : SEED_CONTAINERS; } catch { c = SEED_CONTAINERS; }
      try { const r = await storageGet("events"); e = r ? JSON.parse(r.value) : SEED_EVENTS; } catch { e = SEED_EVENTS; }
      try {
        const r = await storageGet("garden");
        g = r ? JSON.parse(r.value) : null;
      } catch { g = null; }
      if (!g) {
        g = { ...DEFAULT_GARDEN, established_at: new Date().toISOString() };
        try { await storageSet("garden", JSON.stringify(g)); } catch (err) { console.error(err); }
      }
      setPlantings(p); setContainers(c); setEvents(e); setGarden(g);
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (nextPlantings, nextEvents, nextContainers) => {
    try {
      if (nextPlantings) await storageSet("plantings", JSON.stringify(nextPlantings));
      if (nextEvents) await storageSet("events", JSON.stringify(nextEvents));
      if (nextContainers) await storageSet("containers", JSON.stringify(nextContainers));
    } catch (err) { console.error("Storage save failed", err); }
  }, []);

  const persistGarden = useCallback(async (g) => {
    try { await storageSet("garden", JSON.stringify(g)); } catch (err) { console.error(err); }
  }, []);

  const updateGardenLocal = useCallback((patch) => {
    setGarden((g) => ({ ...(g || DEFAULT_GARDEN), ...patch }));
  }, []);

  const updateGardenAndPersist = useCallback((patch) => {
    setGarden((g) => {
      const next = { ...(g || DEFAULT_GARDEN), ...patch };
      persistGarden(next);
      return next;
    });
  }, [persistGarden]);

  /** Appends one event or an array of events, then persists. */
  const addEvent = useCallback(async (eventOrEvents) => {
    const toAdd = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    setEvents((prev) => {
      const next = [...prev, ...toAdd];
      persist(null, next);
      return next;
    });
  }, [persist]);

  const addPlanting = useCallback(async (form) => {
    if (!form.nickname.trim()) return;
    const now = new Date().toISOString();
    const container = {
      id: uid("container"), garden_id: GARDEN_ID, name: `${form.nickname.trim()} container`,
      type: form.containerType, mobility: "movable", material: form.material,
      volume_l: form.containerSize ? Number(form.containerSize) : undefined,
      created_at: now,
    };
    const containerSetupEvent = {
      id: uid("evt"), timestamp: now, garden_id: GARDEN_ID, entity_type: "container", entity_id: container.id,
      category: "lifecycle", source: "self", event_type: "container_setup",
      payload: {
        initial_placement: form.placement.trim() || "Unspecified",
        initial_soil_composition: form.soilComposition.filter((r) => r.component.trim()).map((r) => ({ component: r.component.trim(), percent: Number(r.percent) || 0 })),
      },
      confidence: "observed",
    };
    const planting = { id: uid("planting"), species: form.species, nickname: form.nickname.trim(), started_at: now };
    const plantingSetupEvent = {
      id: uid("evt"), timestamp: now, garden_id: GARDEN_ID, entity_type: "planting", entity_id: planting.id,
      category: "lifecycle", source: "self", event_type: "planting_setup",
      payload: { container_id: container.id, entry_stage: form.entry_stage, acquisition_source: form.acquisition_source },
      media: form.photo ? [form.photo] : undefined,
      confidence: "observed",
    };
    const nextPlantings = [...plantings, planting];
    const nextContainers = [...containers, container];
    const nextEvents = [...events, containerSetupEvent, plantingSetupEvent];
    setPlantings(nextPlantings); setContainers(nextContainers); setEvents(nextEvents);
    await persist(nextPlantings, nextEvents, nextContainers);
  }, [plantings, containers, events, persist]);

  const addPlantingPhoto = useCallback(async (plantingId, file) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const event = { id: uid("evt"), timestamp: new Date().toISOString(), garden_id: GARDEN_ID, entity_type: "planting", entity_id: plantingId, category: "observation", source: "self", event_type: "photo_log", payload: {}, media: [dataUrl], confidence: "observed" };
      await addEvent(event);
    } catch (err) { console.error(err); }
  }, [addEvent]);

  const resetDemo = useCallback(async () => {
    const freshGarden = { ...DEFAULT_GARDEN, established_at: new Date().toISOString() };
    setPlantings(SEED_PLANTINGS); setContainers(SEED_CONTAINERS); setEvents(SEED_EVENTS); setGarden(freshGarden);
    await persist(SEED_PLANTINGS, SEED_EVENTS, SEED_CONTAINERS);
    await persistGarden(freshGarden);
  }, [persist, persistGarden]);

  return {
    loaded, plantings, containers, events, garden,
    addEvent, addPlanting, addPlantingPhoto,
    updateGardenLocal, updateGardenAndPersist, persistGarden,
    resetDemo,
  };
}
