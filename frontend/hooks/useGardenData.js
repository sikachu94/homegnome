import { useState, useEffect, useCallback } from "react";
import { storageGet, storageSet } from "../lib/storage.js";
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
  const [calendarTasks, setCalendarTasks] = useState([]);
  const [garden, setGarden] = useState(null);
  const [gardenId, setGardenId] = useState(GARDEN_ID);
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
    setGardenId(nextGarden.id || GARDEN_ID);
    setGarden(nextGarden);
    setPlantings(data.plantings || []);
    setContainers(data.containers || []);
    setEvents(data.events || []);
    const storedTasks = await storageGet("calendarTasks");
    setCalendarTasks(storedTasks ? JSON.parse(storedTasks.value) : []);
    await persist(data.plantings || [], data.events || [], data.containers || []);
    await persistGarden(nextGarden);
  }, [persist, persistGarden]);

  useEffect(() => {
    (async () => {
      try {
        const response = await apiGardens();
        const remoteGarden = response.gardens?.find((item) => item.id === GARDEN_ID) || response.gardens?.[0];
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

  const refresh = useCallback(async () => {
    const response = await apiGardens();
    const remoteGarden = response.gardens?.find((item) => item.id === gardenId);
    if (!remoteGarden) throw new Error(`Garden ${gardenId} was not returned by the API`);
    await applyGarden(remoteGarden);
  }, [applyGarden, gardenId]);

  const updateGardenLocal = useCallback((patch) => {
    setGarden((g) => ({ ...(g || DEFAULT_GARDEN), ...patch }));
  }, []);

  const updateGardenAndPersist = useCallback((patch) => {
    setGarden((g) => {
      const next = { ...(g || DEFAULT_GARDEN), ...patch };
      apiUpdateGarden(gardenId, patch)
        .then(({ garden: saved }) => persistGarden({ ...saved, label: saved.label || saved.name }))
        .catch((err) => console.error("Garden update failed", err));
      return next;
    });
  }, [gardenId, persistGarden]);

  /** Appends one event or an array of events, then persists. */
  const addEvent = useCallback(async (eventOrEvents) => {
    const toAdd = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    const created = await Promise.all(toAdd.map((event) => apiCreateEvent(gardenId, event)));
    const response = await apiGardens();
    const remoteGarden = response.gardens?.find((item) => item.id === gardenId);
    if (remoteGarden) await applyGarden(remoteGarden);
    else setEvents((prev) => [...prev, ...created.map(({ event }) => event)]);
  }, [applyGarden, gardenId]);

  const updateCalendarTask = useCallback(async (task) => {
    setCalendarTasks((previous) => {
      const next = previous.some((item) => item.id === task.id)
        ? previous.map((item) => (item.id === task.id ? task : item))
        : [...previous, task];
      storageSet("calendarTasks", JSON.stringify(next));
      return next;
    });
  }, []);

  const completeCalendarTask = useCallback(async (task) => {
    if (task.type === "watering") {
      await addEvent({
        id: uid("evt"), timestamp: new Date().toISOString(), garden_id: gardenId,
        entity_type: "planting", entity_id: task.planting_id, category: "action", source: "self",
        event_type: "watering", payload: {}, confidence: "observed",
      });
    }
    await updateCalendarTask({ ...task, status: "completed" });
  }, [addEvent, gardenId, updateCalendarTask]);

  const addPlanting = useCallback(async (form) => {
    if (!form.nickname.trim()) return;
    const now = new Date().toISOString();
    const existingContainerId = form.containerMode === "existing" ? form.containerId : null;
    const container = existingContainerId
      ? null
      : {
          id: uid("container"), garden_id: gardenId, name: `${form.material} ${form.containerType} container`,
          type: form.containerType, mobility: "movable", material: form.material,
          volume_l: form.containerSize ? Number(form.containerSize) : undefined,
          created_at: now,
        };
    const containerIdForEvents = existingContainerId || container?.id;
    const containerSetupEvent = {
      id: uid("evt"), timestamp: now, garden_id: gardenId, entity_type: "container", entity_id: containerIdForEvents,
      category: "lifecycle", source: "self", event_type: "container_setup",
      payload: {
        initial_placement: form.placement.trim() || "Unspecified",
        initial_soil_composition: form.soilComposition.filter((r) => r.component.trim()).map((r) => ({ component: r.component.trim(), percent: Number(r.percent) || 0 })),
      },
      confidence: "observed",
    };
    const planting = { id: uid("planting"), species: form.species, nickname: form.nickname.trim(), started_at: now };
    const plantingSetupEvent = {
      id: uid("evt"), timestamp: now, garden_id: gardenId, entity_type: "planting", entity_id: planting.id,
      category: "lifecycle", source: "self", event_type: "planting_setup",
      payload: { container_id: containerIdForEvents, entry_stage: form.entry_stage, acquisition_source: form.acquisition_source },
      media: form.photo ? [form.photo] : undefined,
      confidence: "observed",
    };
    const eventsToPersist = existingContainerId ? [plantingSetupEvent] : [containerSetupEvent, plantingSetupEvent];
    const response = await apiCreatePlanting(gardenId, {
      ...(existingContainerId ? { container_id: existingContainerId } : { container }),
      planting: { ...planting, garden_id: gardenId },
      events: eventsToPersist,
    });
    const aggregate = await apiGardens();
    const remoteGarden = aggregate.gardens?.find((item) => item.id === gardenId);
    if (remoteGarden) await applyGarden(remoteGarden);
    else {
      setPlantings((prev) => [...prev, response.planting]);
      setContainers((prev) => [...prev, response.container]);
      setEvents((prev) => [...prev, ...response.events]);
    }
  }, [applyGarden, gardenId]);

  const addPlantingPhoto = useCallback(async (plantingId, file) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const event = { id: uid("evt"), timestamp: new Date().toISOString(), garden_id: gardenId, entity_type: "planting", entity_id: plantingId, category: "observation", source: "self", event_type: "photo_log", payload: {}, media: [dataUrl], confidence: "observed" };
      await addEvent(event);
    } catch (err) { console.error(err); }
  }, [addEvent, gardenId]);

  const resetDemo = useCallback(async () => {
    const response = await apiGardens();
    const remoteGarden = response.gardens?.find((item) => item.id === gardenId);
    if (!remoteGarden) throw new Error(`Configured garden ${GARDEN_ID} was not returned by the API`);
    await applyGarden(remoteGarden);
    setLoadError(null);
  }, [applyGarden, gardenId]);

  return {
    loaded, loadError, plantings, containers, events, calendarTasks, garden, gardenId,
    addEvent, addPlanting, addPlantingPhoto,
    updateCalendarTask, completeCalendarTask,
    updateGardenLocal, updateGardenAndPersist, persistGarden,
    resetDemo,
    refresh,
  };
}
