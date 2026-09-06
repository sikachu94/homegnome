import { useState, useEffect, useCallback } from "react";
import { storageSet } from "../lib/storage.js";
import { uid } from "../lib/format.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { GARDEN_ID, DEFAULT_GARDEN } from "../lib/seedData.js";
import { apiGardens, apiCreateEvent, apiCreatePlanting, apiUpdateGarden } from "../api.js";

/**
 * Owns plantings/containers/events/garden state and their persistence.
 * Supabase is the source of truth. Local storage is only used as an offline
 * fallback for the demo shell when the API cannot be reached.
 */
export function useGardenData() {
  const [plantings, setPlantings] = useState(null);
  const [containers, setContainers] = useState(null);
  const [events, setEvents] = useState(null);
  const [garden, setGarden] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

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

  const applyGarden = useCallback(async (data) => {
    const nextGarden = { ...data, label: data.label || data.name };
    setGarden(nextGarden);
    setPlantings(data.plantings || []);
    setContainers(data.containers || []);
    setEvents(data.events || []);
    await persist(data.plantings || [], data.events || [], data.containers || []);
    await persistGarden(nextGarden);
  }, [persist, persistGarden]);

  useEffect(() => {
    (async () => {
      try {
        const response = await apiGardens();
        const remoteGarden = response.gardens?.find((item) => item.id === GARDEN_ID);
        if (!remoteGarden) throw new Error(`Configured garden ${GARDEN_ID} was not returned by the API`);
        await applyGarden(remoteGarden);
        setLoadError(null);
        setLoaded(true);
      } catch (err) {
        console.error("Unable to load garden from backend", err);
        setLoadError("Your garden could not be loaded from the backend. Check your connection and sign-in, then try again.");
        setPlantings([]);
        setContainers([]);
        setEvents([]);
        setGarden(null);
        setLoaded(true);
      }
    })();
  }, [applyGarden]);

  const updateGardenLocal = useCallback((patch) => {
    setGarden((g) => ({ ...(g || DEFAULT_GARDEN), ...patch }));
  }, []);

  const updateGardenAndPersist = useCallback((patch) => {
    setGarden((g) => {
      const next = { ...(g || DEFAULT_GARDEN), ...patch };
      apiUpdateGarden(GARDEN_ID, patch)
        .then(({ garden: saved }) => persistGarden({ ...saved, label: saved.label || saved.name }))
        .catch((err) => console.error("Garden update failed", err));
      return next;
    });
  }, [persistGarden]);

  /** Appends one event or an array of events, then persists. */
  const addEvent = useCallback(async (eventOrEvents) => {
    const toAdd = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    const created = await Promise.all(toAdd.map((event) => apiCreateEvent(GARDEN_ID, event)));
    const response = await apiGardens();
    const remoteGarden = response.gardens?.find((item) => item.id === GARDEN_ID);
    if (remoteGarden) await applyGarden(remoteGarden);
    else setEvents((prev) => [...prev, ...created.map(({ event }) => event)]);
  }, [applyGarden]);

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
    const response = await apiCreatePlanting(GARDEN_ID, {
      container,
      planting: { ...planting, garden_id: GARDEN_ID },
      events: [containerSetupEvent, plantingSetupEvent],
    });
    const aggregate = await apiGardens();
    const remoteGarden = aggregate.gardens?.find((item) => item.id === GARDEN_ID);
    if (remoteGarden) await applyGarden(remoteGarden);
    else {
      setPlantings((prev) => [...prev, response.planting]);
      setContainers((prev) => [...prev, response.container]);
      setEvents((prev) => [...prev, ...response.events]);
    }
  }, [applyGarden]);

  const addPlantingPhoto = useCallback(async (plantingId, file) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const event = { id: uid("evt"), timestamp: new Date().toISOString(), garden_id: GARDEN_ID, entity_type: "planting", entity_id: plantingId, category: "observation", source: "self", event_type: "photo_log", payload: {}, media: [dataUrl], confidence: "observed" };
      await addEvent(event);
    } catch (err) { console.error(err); }
  }, [addEvent]);

  const resetDemo = useCallback(async () => {
    const response = await apiGardens();
    const remoteGarden = response.gardens?.find((item) => item.id === GARDEN_ID);
    if (!remoteGarden) throw new Error(`Configured garden ${GARDEN_ID} was not returned by the API`);
    await applyGarden(remoteGarden);
    setLoadError(null);
  }, [applyGarden]);

  return {
    loaded, loadError, plantings, containers, events, garden,
    addEvent, addPlanting, addPlantingPhoto,
    updateGardenLocal, updateGardenAndPersist, persistGarden,
    resetDemo,
  };
}
