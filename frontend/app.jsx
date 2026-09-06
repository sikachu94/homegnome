import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sprout, NotebookPen, MessageCircle, Mic, Square, Plus, X, Loader2, RotateCcw,
  Droplets, Scissors, Bug, Sparkles, MapPin, CloudRain, Snowflake, Thermometer,
  Camera, Box, Layers, ImagePlus, Apple, Leaf, Carrot, Flower2, Wheat,
} from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { apiChat, apiExtract, apiGardens, apiCreatePlanting, apiCreateEvent, apiUpdateGarden } from "./api.js";
import gnomeLogo from "./assets/gnome_only.jpg";

// ---------------------------------------------------------------------------
// Static reference data
// ---------------------------------------------------------------------------
const PHENOPHASES = ["seed", "germinated", "seedling", "vegetative", "budding", "flowering", "fruiting", "seed_set", "senescent", "dormant", "mature"];
const ACQUISITION = ["sown_self", "purchased_seedling", "gifted", "cutting", "division", "purchased_mature"];
const CONTAINER_TYPES = ["pot", "raised_bed", "in_ground", "hanging_basket", "window_box", "vertical_planter", "grow_bag"];
const CONTAINER_MATERIALS = ["terracotta", "plastic", "wood", "metal", "fabric", "ground"];
const GARDEN_TYPES = ["balcony", "backyard", "rooftop", "indoor", "community_plot", "greenhouse"];

const SPECIES_META = {
  Tomato: { harvest_type: "fruit", life_cycle_type: "annual", sun_hours: [6, 8], water_frequency_days: 2, days_to_maturity: 75, target_stage: "fruiting", flowering_signal: "harvest_precondition" },
  Basil: { harvest_type: "leaf", life_cycle_type: "annual", sun_hours: [5, 7], water_frequency_days: 2, days_to_maturity: 60, target_stage: "vegetative", flowering_signal: "decline_warning" },
  Lettuce: { harvest_type: "leaf", life_cycle_type: "annual", sun_hours: [4, 6], water_frequency_days: 2, days_to_maturity: 45, target_stage: "vegetative", flowering_signal: "decline_warning" },
  Pepper: { harvest_type: "fruit", life_cycle_type: "annual", sun_hours: [6, 8], water_frequency_days: 3, days_to_maturity: 70, target_stage: "fruiting", flowering_signal: "harvest_precondition" },
  Cucumber: { harvest_type: "fruit", life_cycle_type: "annual", sun_hours: [6, 8], water_frequency_days: 2, days_to_maturity: 55, target_stage: "fruiting", flowering_signal: "harvest_precondition" },
  Mint: { harvest_type: "leaf", life_cycle_type: "perennial", sun_hours: [3, 6], water_frequency_days: 2, days_to_maturity: 40, target_stage: "vegetative", flowering_signal: "decline_warning" },
  Rosemary: { harvest_type: "leaf", life_cycle_type: "perennial", sun_hours: [6, 8], water_frequency_days: 5, days_to_maturity: 80, target_stage: "vegetative", flowering_signal: "neutral" },
  Strawberry: { harvest_type: "fruit", life_cycle_type: "perennial", sun_hours: [6, 8], water_frequency_days: 2, days_to_maturity: 60, target_stage: "fruiting", flowering_signal: "harvest_precondition" },
};

const EVENT_TYPES = {
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
const scopeOf = (eventType) => EVENT_TYPES[eventType]?.scope || "planting";

const PRESET_LOCATIONS = [
  { label: "New York, US", lat: 40.7128, lng: -74.0060 },
  { label: "Cairo, EG", lat: 30.0444, lng: 31.2357 },
  { label: "Barcelona, ES", lat: 41.3851, lng: 2.1775 },
];

// Temporary: until there's a garden picker backed by a real /api/gardens
// endpoint, the garden this app operates on comes from an env var. It must
// match a row in Supabase's `gardens` table owned by whichever user
// VITE_DEV_EMAIL/VITE_DEV_PASSWORD sign in as (see lib/supabaseClient.js) —
// otherwise verify_garden_ownership() in api/deps.py will 404 every call.
const GARDEN_ID = import.meta.env.VITE_DEV_GARDEN_ID || "garden_poc_1";

const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const daysBetween = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const formatComposition = (comp) => (comp && comp.length ? comp.map((c) => `${c.percent}% ${c.component}`).join(", ") : "Unspecified");

const DEFAULT_GARDEN = { name: "My garden", type: "balcony", notes: "", location: null, label: null };

// ---------------------------------------------------------------------------
// Seed data — two plantings, each with its own container + soil composition
// ---------------------------------------------------------------------------
const SEED_CONTAINERS = [
  { id: "container_seed_1", garden_id: GARDEN_ID, name: "Balcony rail pot", type: "pot", mobility: "movable", material: "terracotta", volume_l: 15, created_at: daysAgo(34) },
  { id: "container_seed_2", garden_id: GARDEN_ID, name: "Kitchen window pot", type: "pot", mobility: "movable", material: "plastic", volume_l: 4, created_at: daysAgo(16) },
];
const SEED_PLANTINGS = [
  { id: "planting_seed_1", species: "Tomato", nickname: "Balcony tomato", started_at: daysAgo(34) },
  { id: "planting_seed_2", species: "Basil", nickname: "Kitchen basil", started_at: daysAgo(16) },
];
const SEED_EVENTS = [
  { id: uid("evt"), timestamp: daysAgo(34), garden_id: GARDEN_ID, entity_type: "container", entity_id: "container_seed_1", category: "lifecycle", source: "self", event_type: "container_setup", payload: { initial_placement: "South-facing balcony rail", initial_soil_composition: [{ component: "Potting mix", percent: 70 }, { component: "Compost", percent: 20 }, { component: "Perlite", percent: 10 }], sun_exposure_hours: 7 }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(16), garden_id: GARDEN_ID, entity_type: "container", entity_id: "container_seed_2", category: "lifecycle", source: "self", event_type: "container_setup", payload: { initial_placement: "Kitchen windowsill", initial_soil_composition: [{ component: "Standard potting mix", percent: 100 }], sun_exposure_hours: 4 }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(34), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_1", category: "lifecycle", source: "self", event_type: "planting_setup", payload: { container_id: "container_seed_1", entry_stage: "seedling", acquisition_source: "purchased_seedling" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(16), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_2", category: "lifecycle", source: "self", event_type: "planting_setup", payload: { container_id: "container_seed_2", entry_stage: "seedling", acquisition_source: "purchased_seedling" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(20), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_1", category: "lifecycle", source: "self", event_type: "stage_change", payload: { from_stage: "seedling", to_stage: "vegetative" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(6), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_1", category: "lifecycle", source: "self", event_type: "stage_change", payload: { from_stage: "vegetative", to_stage: "flowering" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(2), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_1", category: "action", source: "self", event_type: "watering", payload: { amount_l: 0.5, method: "hand" }, confidence: "observed" },
  { id: uid("evt"), timestamp: daysAgo(1), garden_id: GARDEN_ID, entity_type: "planting", entity_id: "planting_seed_2", category: "action", source: "self", event_type: "watering", payload: { amount_l: 0.2, method: "hand" }, confidence: "observed" },
];

// ---------------------------------------------------------------------------
// Image helper
// ---------------------------------------------------------------------------
function fileToDataUrl(file, maxDim = 480, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------
function projectContainer(container, events) {
  if (!container) return null;
  const own = events.filter((e) => e.entity_type === "container" && e.entity_id === container.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const setup = own.find((e) => e.event_type === "container_setup");
  const lastRelocate = [...own].reverse().find((e) => e.event_type === "relocated");
  const lastSoilAmend = [...own].reverse().find((e) => e.event_type === "soil_amended");
  const coverEvent = [...own].reverse().find((e) => e.media?.length);
  return {
    placement: lastRelocate?.payload?.new_placement || setup?.payload?.initial_placement || "Unspecified",
    soil_composition: lastSoilAmend?.payload?.new_soil_composition || setup?.payload?.initial_soil_composition || [],
    sun_exposure_hours: setup?.payload?.sun_exposure_hours,
    cover_image: coverEvent?.media?.[0],
  };
}

function projectPlanting(planting, events) {
  const own = events.filter((e) => e.entity_type === "planting" && e.entity_id === planting.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const setup = own.find((e) => e.event_type === "planting_setup");
  const lastStageChange = [...own].reverse().find((e) => e.event_type === "stage_change");
  const ended = [...own].reverse().find((e) => e.event_type === "planting_ended");
  const lastWater = [...own].reverse().find((e) => e.event_type === "watering");
  const lastIssue = [...own].reverse().find((e) => e.event_type === "pest_sighting" || e.event_type === "disease_sighting");
  const transplants = own.filter((e) => e.event_type === "transplanted");
  const harvests = own.filter((e) => e.event_type === "harvest");
  const coverEvent = [...own].reverse().find((e) => e.media?.length);

  return {
    stage: lastStageChange?.payload?.to_stage || setup?.payload?.entry_stage || "unknown",
    status: ended ? "ended" : "active",
    end_reason: ended?.payload?.end_reason,
    container_id: transplants.length ? transplants[transplants.length - 1].payload.to_container_id : setup?.payload?.container_id,
    days_since_entry: daysBetween(planting.started_at),
    last_watered_at: lastWater?.timestamp,
    harvest_count: harvests.length,
    open_issue: lastIssue,
    cover_image: coverEvent?.media?.[0],
  };
}

const HARVEST_ICON = { fruit: Apple, leaf: Leaf, root: Carrot, flower_bud: Flower2, seed_grain: Wheat, ornamental_flower: Flower2, ornamental_foliage: Leaf };
function GenericPlantImage({ harvestType, size = 28 }) {
  const Icon = HARVEST_ICON[harvestType] || Sprout;
  return <Icon size={size} />;
}

const blankSoilRow = () => ({ id: uid("soil"), component: "", percent: 0 });
const blankNewPlanting = () => ({
  nickname: "", species: "Tomato", entry_stage: "seedling", acquisition_source: "purchased_seedling",
  containerType: "pot", material: "terracotta", containerSize: "", placement: "",
  soilComposition: [{ id: uid("soil"), component: "Potting mix", percent: 100 }],
  photo: null,
});

export default function App() {
  const [tab, setTab] = useState("capture");
  const [plantings, setPlantings] = useState(null);
  const [containers, setContainers] = useState(null);
  const [events, setEvents] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // capture tab state
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [extractError, setExtractError] = useState(null);
  const recognitionRef = useRef(null);

  // add-planting form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlanting, setNewPlanting] = useState(blankNewPlanting());
  const [plantingError, setPlantingError] = useState(null);

  // garden state (identity + location/weather)
  const [garden, setGarden] = useState(null);
  const [gardenRecords, setGardenRecords] = useState([]);
  const [selectedGardenId, setSelectedGardenId] = useState(GARDEN_ID);
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(null);
  const [locating, setLocating] = useState(false);
  const [weatherTick, setWeatherTick] = useState(0);

  // chat tab state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const chatEndRef = useRef(null);

  // ---- load / persist -----------------------------------------------------
  useEffect(() => {
    (async () => {
      let p, c, e, g;
      let remoteGardens = [];
      try {
        const response = await apiGardens();
        remoteGardens = response.gardens || [];
      } catch (err) {
        console.error("Could not load gardens from the API", err);
        setLoadError("Couldn't load your gardens. Check your connection and try again.");
      }
      if (remoteGardens.length) {
        const initial = remoteGardens.find((item) => item.id === GARDEN_ID) || remoteGardens[0];
        setGardenRecords(remoteGardens);
        setSelectedGardenId(initial.id);
        p = initial.plantings || [];
        c = initial.containers || [];
        e = initial.events || [];
        g = initial;
      } else {
        p = [];
        c = [];
        e = [];
        g = null;
      }
      setPlantings(p); setContainers(c); setEvents(e); setGarden(g);
      setLoaded(true);
    })();
  }, []);

  const activeGardenId = selectedGardenId === "all" ? GARDEN_ID : selectedGardenId;
  const visiblePlantings = selectedGardenId === "all"
    ? gardenRecords.flatMap((record) => record.plantings || [])
    : plantings || [];
  const visibleContainers = selectedGardenId === "all"
    ? gardenRecords.flatMap((record) => record.containers || [])
    : containers || [];
  const visibleEvents = selectedGardenId === "all"
    ? gardenRecords.flatMap((record) => record.events || [])
    : events || [];

  const selectGarden = (id) => {
    if (id === "all") {
      setSelectedGardenId(id);
      return;
    }
    const record = gardenRecords.find((item) => item.id === id);
    if (!record) return;
    setSelectedGardenId(id);
    setGarden(record);
    setPlantings(record.plantings || []);
    setContainers(record.containers || []);
    setEvents(record.events || []);
    setWeather(null);
  };

  const persistGarden = useCallback(async (g) => {
    if (!gardenRecords.some((record) => record.id === g?.id)) return;
    const { garden: updated } = await apiUpdateGarden(g.id, {
      name: g.name, type: g.type, location: g.location, notes: g.notes,
    });
    const localUpdated = { ...updated, label: g.label };
    setGarden(localUpdated);
    setGardenRecords((records) => records.map((record) => record.id === updated.id ? { ...record, ...localUpdated } : record));
  }, [gardenRecords]);

  const refreshRemoteGardens = async (focusId = selectedGardenId) => {
    const response = await apiGardens();
    const records = response.gardens || [];
    setGardenRecords(records);
    const record = records.find((item) => item.id === focusId);
    if (record) {
      setGarden(record);
      setPlantings(record.plantings || []);
      setContainers(record.containers || []);
      setEvents(record.events || []);
    }
    return record;
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ---- weather: fetch + auto-log external garden events --------------------
  useEffect(() => {
    if (!garden?.location) return;
    let cancelled = false;
    (async () => {
      try {
        const { lat, lng } = garden.location;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code&daily=precipitation_sum,temperature_2m_min,temperature_2m_max&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("weather fetch failed");
        const data = await res.json();
        if (cancelled) return;
        setWeather(data);
        setWeatherError(null);
        const todayKey = new Date().toDateString();
        const alreadyRain = events.some((ev) => ev.entity_type === "garden" && ev.event_type === "rainfall" && new Date(ev.timestamp).toDateString() === todayKey);
        const alreadyFrost = events.some((ev) => ev.entity_type === "garden" && ev.event_type === "frost" && new Date(ev.timestamp).toDateString() === todayKey);
        const precipToday = data.daily?.precipitation_sum?.[0];
        const minTemp = data.daily?.temperature_2m_min?.[0];
        const auto = [];
        if (!alreadyRain && typeof precipToday === "number" && precipToday > 0.5) {
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: activeGardenId, entity_type: "garden", entity_id: activeGardenId, category: "measurement", source: "external", event_type: "rainfall", payload: { amount_mm: precipToday }, confidence: "observed" });
        }
        if (!alreadyFrost && typeof minTemp === "number" && minTemp < 0) {
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: activeGardenId, entity_type: "garden", entity_id: activeGardenId, category: "observation", source: "external", event_type: "frost", payload: { severity: minTemp < -3 ? "hard" : "light" }, confidence: "observed" });
        }
        if (auto.length) {
          try {
            await Promise.all(auto.map((event) => apiCreateEvent(activeGardenId, event)));
            if (!cancelled) await refreshRemoteGardens(activeGardenId);
            else return;
          } catch (err) {
            console.error("Weather event save failed", err);
          }
        }
      } catch (err) {
        if (!cancelled) setWeatherError("Couldn't fetch weather right now.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garden, weatherTick]);

  const setGardenLocation = async (loc) => {
    const g = { ...(garden || DEFAULT_GARDEN), location: { lat: loc.lat, lng: loc.lng }, label: loc.label };
    setGarden(g); setWeather(null); await persistGarden(g);
  };
  const clearGardenLocation = async () => {
    const g = { ...garden, location: null, label: null };
    setGarden(g); setWeather(null); await persistGarden(g);
  };
  const useMyLocation = () => {
    if (!navigator.geolocation) { setWeatherError("Location isn't available in this browser — pick a city instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setGardenLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Current location" }); },
      () => { setLocating(false); setWeatherError("Couldn't get your location — pick a city instead."); },
      { timeout: 8000 }
    );
  };

  const updateGardenLocal = (patch) => setGarden((g) => ({ ...(g || DEFAULT_GARDEN), ...patch }));
  const updateGardenAndPersist = (patch) => { const g = { ...(garden || DEFAULT_GARDEN), ...patch }; setGarden(g); persistGarden(g); };

  // ---- voice capture --------------------------------------------------------
  const speechSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const toggleListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
    rec.onresult = (e) => { const t = Array.from(e.results).map((r) => r[0].transcript).join(" "); setNote((prev) => (prev ? prev + " " + t : t)); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec; rec.start(); setListening(true);
  };

  // ---- capture: note -> structured events (via real backend) ---------------
  const runExtraction = async () => {
    if (!note.trim()) return;
    setExtracting(true); setExtractError(null);
    try {
      // api/extract.py resolves "known plantings" for GARDEN_ID straight
      // from Supabase's `plantings` table, so drafts will only match
      // plantings that actually exist there — not the local demo/seed
      // plantings this component keeps in localStorage.
      const { drafts: rawDrafts } = await apiExtract(activeGardenId, note);
      const withIds = (rawDrafts || []).map((d) => ({ ...d, draft_id: uid("draft"), media: [] }));
      setDrafts(withIds);
    } catch (err) {
      setExtractError("Couldn't reach the extraction service — check your connection and that you're signed in.");
    } finally { setExtracting(false); }
  };

  const updateDraftPlanting = (draftId, plantingId) => setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, planting_id: plantingId } : d)));
  const discardDraft = (draftId) => setDrafts((ds) => ds.filter((d) => d.draft_id !== draftId));
  const attachDraftPhoto = async (draftId, file) => {
    if (!file) return;
    try { const dataUrl = await fileToDataUrl(file); setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, media: [dataUrl] } : d))); }
    catch (err) { console.error(err); }
  };
  const removeDraftPhoto = (draftId) => setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, media: [] } : d)));

  const buildEvent = (draft) => {
    const scope = scopeOf(draft.event_type);
    return {
      id: uid("evt"), timestamp: new Date().toISOString(), garden_id: activeGardenId,
      entity_type: scope === "garden" ? "garden" : "planting",
      entity_id: scope === "garden" ? activeGardenId : draft.planting_id,
      category: draft.category, source: "self", event_type: draft.event_type,
      payload: draft.payload || {}, note: draft.note || undefined,
      media: draft.media?.length ? draft.media : undefined,
      confidence: "observed",
    };
  };
  const saveDraft = async (draft) => {
    if (scopeOf(draft.event_type) === "planting" && !draft.planting_id) return;
    await apiCreateEvent(activeGardenId, buildEvent(draft));
    await refreshRemoteGardens(activeGardenId);
    discardDraft(draft.draft_id);
  };
  const saveAllDrafts = async () => {
    const ready = drafts.filter((d) => scopeOf(d.event_type) === "garden" || d.planting_id);
    if (!ready.length) return;
    await Promise.all(ready.map((draft) => apiCreateEvent(activeGardenId, buildEvent(draft))));
    await refreshRemoteGardens(activeGardenId);
    setDrafts((ds) => ds.filter((d) => scopeOf(d.event_type) !== "garden" && !d.planting_id));
    setNote("");
  };

  // ---- add planting + its container -----------------------------------------
  const handleNewPlantingPhoto = async (file) => {
    if (!file) return;
    try { const dataUrl = await fileToDataUrl(file); setNewPlanting((n) => ({ ...n, photo: dataUrl })); }
    catch (err) { console.error(err); }
  };
  const addSoilRow = () => setNewPlanting((n) => ({ ...n, soilComposition: [...n.soilComposition, blankSoilRow()] }));
  const updateSoilRow = (id, patch) => setNewPlanting((n) => ({ ...n, soilComposition: n.soilComposition.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeSoilRow = (id) => setNewPlanting((n) => ({ ...n, soilComposition: n.soilComposition.filter((r) => r.id !== id) }));
  const soilTotal = newPlanting.soilComposition.reduce((s, r) => s + (Number(r.percent) || 0), 0);

  const addPlanting = async () => {
    if (!newPlanting.nickname.trim()) return;
    setPlantingError(null);
    const now = new Date().toISOString();
    const container = {
      id: uid("container"), garden_id: activeGardenId, name: `${newPlanting.nickname.trim()} container`,
      type: newPlanting.containerType, mobility: "movable", material: newPlanting.material,
      volume_l: newPlanting.containerSize ? Number(newPlanting.containerSize) : undefined,
      created_at: now,
    };
    const containerSetupEvent = {
      id: uid("evt"), timestamp: now, garden_id: activeGardenId, entity_type: "container", entity_id: container.id,
      category: "lifecycle", source: "self", event_type: "container_setup",
      payload: {
        initial_placement: newPlanting.placement.trim() || "Unspecified",
        initial_soil_composition: newPlanting.soilComposition.filter((r) => r.component.trim()).map((r) => ({ component: r.component.trim(), percent: Number(r.percent) || 0 })),
      },
      confidence: "observed",
    };
    const planting = { id: uid("planting"), species: newPlanting.species, nickname: newPlanting.nickname.trim(), started_at: now };
    const plantingSetupEvent = {
      id: uid("evt"), timestamp: now, garden_id: activeGardenId, entity_type: "planting", entity_id: planting.id,
      category: "lifecycle", source: "self", event_type: "planting_setup",
      payload: { container_id: container.id, entry_stage: newPlanting.entry_stage, acquisition_source: newPlanting.acquisition_source },
      media: newPlanting.photo ? [newPlanting.photo] : undefined,
      confidence: "observed",
    };
    try {
      await apiCreatePlanting(activeGardenId, {
        container,
        planting,
        events: [containerSetupEvent, plantingSetupEvent],
      });
      await refreshRemoteGardens(activeGardenId);
      setNewPlanting(blankNewPlanting());
      setShowAddForm(false);
    } catch (err) {
      console.error("Planting save failed", err);
      setPlantingError("Couldn't save this planting. Check your connection and try again.");
    }
  };

  const addPlantingPhoto = async (plantingId, file) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const event = { id: uid("evt"), timestamp: new Date().toISOString(), garden_id: activeGardenId, entity_type: "planting", entity_id: plantingId, category: "observation", source: "self", event_type: "photo_log", payload: {}, media: [dataUrl], confidence: "observed" };
      await apiCreateEvent(activeGardenId, event);
      await refreshRemoteGardens(activeGardenId);
    } catch (err) { console.error(err); }
  };

  // ---- chat (via real backend) -------------------------------------------
  const labelForEntity = (e) => (e.entity_type === "garden" ? "Weather" : plantings.find((p) => p.id === e.entity_id)?.nickname || "Unknown planting");

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatting) return;
    const nextMessages = [...chatMessages, { role: "user", text }];
    setChatMessages(nextMessages); setChatInput(""); setChatting(true);
    try {
      const projections = plantings.map((p) => {
        const proj = projectPlanting(p, events);
        const cont = containers.find((c) => c.id === proj.container_id);
        const contState = projectContainer(cont, events);
        return `${p.nickname} (${p.species}, id ${p.id}): stage=${proj.stage}, status=${proj.status}, days_since_entry=${proj.days_since_entry}, last_watered=${proj.last_watered_at ? fmtDateTime(proj.last_watered_at) : "never logged"}, harvests=${proj.harvest_count}, container=${cont ? `${cont.type}/${cont.material}${cont.volume_l ? `/${cont.volume_l}L` : ""}, soil: ${formatComposition(contState.soil_composition)}, placement: ${contState.placement}` : "none recorded"}${proj.open_issue ? `, open_issue=${proj.open_issue.event_type} (${proj.open_issue.payload?.severity || ""} ${proj.open_issue.payload?.pest || proj.open_issue.payload?.disease || ""})` : ""}`;
      }).join("\n");
      const reference = plantings.map((p) => {
        const m = SPECIES_META[p.species];
        if (!m) return null;
        return `${p.species}: sun ${m.sun_hours[0]}-${m.sun_hours[1]}h/day, water every ~${m.water_frequency_days}d, ~${m.days_to_maturity}d to maturity, ready to harvest at "${m.target_stage}" stage, flowering means ${m.flowering_signal === "harvest_precondition" ? "on track" : m.flowering_signal === "decline_warning" ? "past its prime / bolting" : "not particularly meaningful"}.`;
      }).filter(Boolean).join("\n");
      const weatherSummary = garden?.location
        ? weather ? `Location: ${garden.label}. Current ${Math.round(weather.current.temperature_2m)}°C, ${weather.daily.precipitation_sum[0]}mm rain forecast today, low ${Math.round(weather.daily.temperature_2m_min[0])}°C / high ${Math.round(weather.daily.temperature_2m_max[0])}°C.` : "Location is set but weather hasn't loaded yet."
        : "No location set for this garden yet — weather isn't available.";
      const gardenSummary = `${garden?.name || "This garden"} (${garden?.type || "unspecified type"})${garden?.notes ? ` — notes: ${garden.notes}` : ""}. ${plantings.length} plantings across ${containers.length} containers.`;

      // Deliberately no "recent event log" section here: api/chat.py fetches
      // the last 20 garden_events fresh from Supabase itself and appends
      // them to the system prompt server-side. This context string only
      // carries what the backend has no way to see on its own — weather,
      // client-side projections, and species reference data.
      const context = `GARDEN
${gardenSummary}

CURRENT PLANTINGS (including their container & soil)
${projections}

REFERENCE (ideal conditions)
${reference}

CURRENT WEATHER
${weatherSummary}`;

      const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.text }));
      const res = await apiChat(activeGardenId, apiMessages, context);
      setChatMessages((ms) => [...ms, { role: "assistant", text: res.reply }]);
    } catch (err) {
      setChatMessages((ms) => [...ms, { role: "assistant", text: "Something went wrong reaching the assistant — try again in a moment." }]);
    } finally { setChatting(false); }
  };

  const resetDemo = async () => {
    if (!gardenRecords.length) return;
    await refreshRemoteGardens(selectedGardenId);
    setDrafts([]); setChatMessages([]);
  };

  if (!loaded) return <div className="sg-root sg-loading"><Loader2 className="spin" size={22} /><span>Loading your garden…</span><Styles /></div>;
  if (loadError) return <div className="sg-root sg-loading"><span>{loadError}</span><Styles /></div>;

  return (
    <div className="sg-root">
      <Styles />
      <header className="sg-header">
        <div className="sg-brand"><img src={gnomeLogo} alt="myGnomie logo" /><span>myGnomie</span></div>
        <button className="sg-reset" onClick={resetDemo} title="Reset demo data"><RotateCcw size={14} /> Reset demo</button>
      </header>

      {!garden?.location ? (
        <div className="sg-weatherbar setup">
          <span>Set your garden's location for weather-aware advice</span>
          <div className="sg-weather-actions">
            <button className="sg-secondary sm" onClick={useMyLocation} disabled={locating}>{locating ? <Loader2 className="spin" size={12} /> : <MapPin size={12} />} Use my location</button>
            {PRESET_LOCATIONS.map((loc) => <button key={loc.label} className="sg-chip" onClick={() => setGardenLocation(loc)}>{loc.label}</button>)}
          </div>
          {weatherError && <span className="sg-weather-err">{weatherError}</span>}
        </div>
      ) : (
        <div className="sg-weatherbar">
          <span className="sg-weather-loc"><MapPin size={13} /> {garden.label}</span>
          {weather ? (
            <span className="sg-weather-data"><Thermometer size={13} /> {Math.round(weather.current.temperature_2m)}°C <CloudRain size={13} /> {weather.daily.precipitation_sum[0]}mm today</span>
          ) : weatherError ? <span className="sg-weather-err">{weatherError}</span> : <span className="sg-weather-data"><Loader2 className="spin" size={12} /> Checking weather…</span>}
          <button className="sg-reset sm" onClick={() => setWeatherTick((t) => t + 1)}><RotateCcw size={12} /> Refresh</button>
          <button className="sg-reset sm" onClick={clearGardenLocation}>Change location</button>
        </div>
      )}

      <nav className="sg-tabs">
        <button className={tab === "capture" ? "active" : ""} onClick={() => setTab("capture")}><NotebookPen size={16} /> Log</button>
        <button className={tab === "plants" ? "active" : ""} onClick={() => setTab("plants")}><Sprout size={16} /> My garden</button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><MessageCircle size={16} /> Ask myGnomie</button>
      </nav>

      <main className="sg-main">
        {tab === "capture" && (
          <section className="sg-panel">
            <h1>What's happening in the garden?</h1>
            <p className="sg-sub">Tell myGnomie about an even in your garden, he will keep track of it for you.</p>
            <div className="sg-capture-box">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Watered the balcony tomato, and I think the basil has some aphids on the underside of the leaves" rows={4} />
              <div className="sg-capture-actions">
                {speechSupported && <button className={`sg-mic ${listening ? "on" : ""}`} onClick={toggleListening}>{listening ? <Square size={14} /> : <Mic size={14} />} {listening ? "Stop" : "Voice"}</button>}
                <button className="sg-primary" disabled={!note.trim() || extracting} onClick={runExtraction}>{extracting ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />} Parse note</button>
              </div>
              {extractError && <div className="sg-error">{extractError}</div>}
            </div>

            {drafts.length > 0 && (
              <div className="sg-drafts">
                <div className="sg-drafts-head"><h2>Parsed entries</h2><button className="sg-primary sm" onClick={saveAllDrafts}>Save all matched</button></div>
                {drafts.map((d) => (
                  <div key={d.draft_id} className="sg-draft-card">
                    <div className="sg-draft-row">
                      <span className="sg-pill">{d.event_type}</span>
                      <span className="sg-pill muted">{d.category}</span>
                      <button className="sg-icon-btn" onClick={() => discardDraft(d.draft_id)}><X size={14} /></button>
                    </div>
                    <div className="sg-draft-payload">{JSON.stringify(d.payload)}</div>
                    {d.note && <div className="sg-draft-note">"{d.note}"</div>}
                    <div className="sg-draft-row">
                      {d.media?.length ? (
                        <div className="sg-photo-thumb"><img src={d.media[0]} alt="attached" /><button onClick={() => removeDraftPhoto(d.draft_id)}><X size={10} /></button></div>
                      ) : (
                        <label className="sg-photo-add"><Camera size={13} /><input type="file" accept="image/*" hidden onChange={(e) => attachDraftPhoto(d.draft_id, e.target.files?.[0])} /></label>
                      )}
                      {scopeOf(d.event_type) === "garden" ? (
                        <span className="sg-pill muted">Garden-level · no plant match needed</span>
                      ) : (
                        <select value={d.planting_id || ""} onChange={(e) => updateDraftPlanting(d.draft_id, e.target.value)}>
                          <option value="">Match to a planting…</option>
                          {plantings.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                        </select>
                      )}
                      <button className="sg-secondary sm" disabled={scopeOf(d.event_type) === "planting" && !d.planting_id} onClick={() => saveDraft(d)}>Save</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="sg-recent">
              <h2>Recent log</h2>
              {[...visibleEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8).map((e) => (
                <div key={e.id} className="sg-event-row">
                  <EventIcon type={e.event_type} />
                  <div>
                    <div className="sg-event-title">{labelForEntity(e)} · {e.event_type.replace("_", " ")}</div>
                    <div className="sg-event-meta">{fmtDateTime(e.timestamp)}{e.note ? ` — "${e.note}"` : ""}</div>
                  </div>
                  {e.media?.length ? <img className="sg-event-thumb" src={e.media[0]} alt="" /> : null}
                </div>
              ))}
            </div>
            <p className="sg-footnote">Every save adds an event - nothing can be edit (yet).</p>
          </section>
        )}

        {tab === "plants" && (
          <section className="sg-panel">
            <div className="sg-drafts-head">
              <h1>My plants</h1>
              {gardenRecords.length > 0 && (
                <select aria-label="Filter by garden" value={selectedGardenId} onChange={(e) => selectGarden(e.target.value)}>
                  <option value="all">All gardens</option>
                  {gardenRecords.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                </select>
              )}
            </div>

            {selectedGardenId !== "all" && <div className="sg-garden-overview">
              <div className="sg-garden-row">
                <input className="sg-garden-name" value={garden?.name || ""} placeholder="Garden name"
                  onChange={(e) => updateGardenLocal({ name: e.target.value })}
                  onBlur={() => persistGarden(garden)} />
                <select value={garden?.type || "balcony"} onChange={(e) => updateGardenAndPersist({ type: e.target.value })}>
                  {GARDEN_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
              </div>
              <div className="sg-garden-stats">
                <div><span>Plantings</span><strong>{plantings.length}</strong></div>
                <div><span>Containers</span><strong>{containers.length}</strong></div>
                <div><span>Tracking since</span><strong>{garden?.established_at ? fmtDate(garden.established_at) : "—"}</strong></div>
                <div><span>Location</span><strong>{garden?.label || "Not set"}</strong></div>
              </div>
              <textarea className="sg-garden-notes" rows={2} placeholder="Notes about the garden - microclimate, common pests, anything gnome should know."
                value={garden?.notes || ""} onChange={(e) => updateGardenLocal({ notes: e.target.value })} onBlur={() => persistGarden(garden)} />
            </div>}

            <div className="sg-drafts-head" style={{ marginTop: "26px" }}><h2>{selectedGardenId === "all" ? "All plants" : "Plants"}</h2>{selectedGardenId !== "all" && <button className="sg-primary sm" onClick={() => setShowAddForm((s) => !s)}><Plus size={14} /> Add planting</button>}</div>

            {showAddForm && (
              <div className="sg-draft-card">
                <input placeholder="Nickname, e.g. Balcony tomato" value={newPlanting.nickname} onChange={(e) => setNewPlanting((n) => ({ ...n, nickname: e.target.value }))} />
                <div className="sg-draft-row">
                  <select value={newPlanting.species} onChange={(e) => setNewPlanting((n) => ({ ...n, species: e.target.value }))}>{Object.keys(SPECIES_META).map((s) => <option key={s} value={s}>{s}</option>)}</select>
                  <select value={newPlanting.entry_stage} onChange={(e) => setNewPlanting((n) => ({ ...n, entry_stage: e.target.value }))}>{PHENOPHASES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                  <select value={newPlanting.acquisition_source} onChange={(e) => setNewPlanting((n) => ({ ...n, acquisition_source: e.target.value }))}>{ACQUISITION.map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}</select>
                </div>

                <div className="sg-form-label">Container</div>
                <div className="sg-draft-row">
                  <select value={newPlanting.containerType} onChange={(e) => setNewPlanting((n) => ({ ...n, containerType: e.target.value }))}>{CONTAINER_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select>
                  <select value={newPlanting.material} onChange={(e) => setNewPlanting((n) => ({ ...n, material: e.target.value }))}>{CONTAINER_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                  <input type="number" min="0" step="0.5" placeholder="Size (liters)" value={newPlanting.containerSize} onChange={(e) => setNewPlanting((n) => ({ ...n, containerSize: e.target.value }))} style={{ maxWidth: "130px" }} />
                </div>
                <div className="sg-draft-row">
                  <input placeholder="Placement, e.g. south balcony rail" value={newPlanting.placement} onChange={(e) => setNewPlanting((n) => ({ ...n, placement: e.target.value }))} />
                </div>

                <div className="sg-form-label">Soil composition</div>
                {newPlanting.soilComposition.map((row) => (
                  <div className="sg-draft-row" key={row.id}>
                    <input placeholder="Component, e.g. potting mix" value={row.component} onChange={(e) => updateSoilRow(row.id, { component: e.target.value })} />
                    <input type="number" min="0" max="100" placeholder="%" value={row.percent} onChange={(e) => updateSoilRow(row.id, { percent: e.target.value })} style={{ maxWidth: "70px" }} />
                    {newPlanting.soilComposition.length > 1 && <button className="sg-icon-btn" onClick={() => removeSoilRow(row.id)}><X size={14} /></button>}
                  </div>
                ))}
                <div className="sg-draft-row">
                  <button className="sg-secondary sm" onClick={addSoilRow}><Plus size={12} /> Add component</button>
                  <span className={`sg-soil-total ${soilTotal !== 100 ? "warn" : ""}`}>{soilTotal}% total</span>
                </div>

                <div className="sg-form-label">Photo</div>
                <div className="sg-draft-row">
                  {newPlanting.photo ? (
                    <div className="sg-photo-thumb"><img src={newPlanting.photo} alt="new planting" /><button onClick={() => setNewPlanting((n) => ({ ...n, photo: null }))}><X size={10} /></button></div>
                  ) : (
                    <label className="sg-photo-add wide"><ImagePlus size={13} /> Add a photo (optional)<input type="file" accept="image/*" hidden onChange={(e) => handleNewPlantingPhoto(e.target.files?.[0])} /></label>
                  )}
                </div>
                {plantingError && <div className="sg-error">{plantingError}</div>}
                <button className="sg-primary sm" onClick={addPlanting}>Create planting</button>
              </div>
            )}

            <div className="sg-plant-grid">
              {visiblePlantings.map((p) => {
                const gardenEvents = selectedGardenId === "all"
                  ? visibleEvents.filter((event) => event.garden_id === p.garden_id)
                  : visibleEvents;
                const proj = projectPlanting(p, gardenEvents);
                const meta = SPECIES_META[p.species];
                const container = visibleContainers.find((c) => c.id === proj.container_id);
                const contState = projectContainer(container, gardenEvents);
                const coverImage = proj.cover_image || contState?.cover_image;
                return (
                  <div key={p.id} className="sg-plant-card">
                    <div className="sg-cover">
                      {coverImage ? <img src={coverImage} alt={p.nickname} /> : <div className="sg-cover-generic"><GenericPlantImage harvestType={meta?.harvest_type} /></div>}
                      <label className="sg-cover-upload" title="Add a photo"><ImagePlus size={13} /><input type="file" accept="image/*" hidden onChange={(e) => addPlantingPhoto(p.id, e.target.files?.[0])} /></label>
                    </div>
                    <div className="sg-plant-head">
                      <div><div className="sg-plant-name">{p.nickname}</div><div className="sg-plant-species">{p.species}</div></div>
                      <span className={`sg-stage ${proj.status === "ended" ? "ended" : ""}`}>{proj.stage}</span>
                    </div>
                    <div className="sg-plant-stats">
                      <div><span>Age</span><strong>{proj.days_since_entry}d</strong></div>
                      <div><span>Watered</span><strong>{proj.last_watered_at ? fmtDate(proj.last_watered_at) : "—"}</strong></div>
                      <div><span>Harvests</span><strong>{proj.harvest_count || "—"}</strong></div>
                    </div>
                    {container && (
                      <div className="sg-container-info">
                        <span><Box size={12} /> {container.type.replace("_", " ")} · {container.material}{container.volume_l ? ` · ${container.volume_l}L` : ""}</span>
                        <span><Layers size={12} /> {formatComposition(contState.soil_composition)}</span>
                        <span><MapPin size={12} /> {contState.placement}</span>
                      </div>
                    )}
                    {proj.open_issue && <div className="sg-issue"><Bug size={13} /> {proj.open_issue.payload?.pest || proj.open_issue.payload?.disease} · {proj.open_issue.payload?.severity} · {fmtDate(proj.open_issue.timestamp)}</div>}
                    {meta && <div className="sg-reference">Ideal: {meta.sun_hours[0]}–{meta.sun_hours[1]}h sun · water ~every {meta.water_frequency_days}d · ~{meta.days_to_maturity}d to maturity</div>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "chat" && (
          <section className="sg-panel sg-chat-panel">
            <h1>Ask myGnomie</h1>
            <p className="sg-sub">He can help you manage your garden!</p>
            <div className="sg-chat-thread">
              {chatMessages.length === 0 && <div className="sg-chat-empty">Try: "Is my tomato's soil okay?" or "Should I water today given the weather?"</div>}
              {chatMessages.map((m, i) => <div key={i} className={`sg-chat-msg ${m.role}`}>{m.text}</div>)}
              {chatting && <div className="sg-chat-msg assistant"><Loader2 className="spin" size={14} /></div>}
              <div ref={chatEndRef} />
            </div>
            <div className="sg-chat-input">
              <input placeholder="Ask about a plant, get a reminder, or plan next steps…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} />
              <button className="sg-primary" disabled={!chatInput.trim() || chatting} onClick={sendChat}>Send</button>
            </div>
          </section>
        )}
      </main>
      <Analytics />
    </div>
  );
}

function EventIcon({ type }) {
  if (type === "watering") return <Droplets size={15} className="sg-evt-icon" />;
  if (type === "harvest") return <Scissors size={15} className="sg-evt-icon" />;
  if (type === "pest_sighting" || type === "disease_sighting") return <Bug size={15} className="sg-evt-icon" />;
  if (type === "rainfall") return <CloudRain size={15} className="sg-evt-icon" />;
  if (type === "frost") return <Snowflake size={15} className="sg-evt-icon" />;
  if (type === "photo_log") return <Camera size={15} className="sg-evt-icon" />;
  return <Sparkles size={15} className="sg-evt-icon" />;
}

function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap');
      .sg-root { --ink:#1F2A22; --canvas:#EEF1E7; --panel:#FFFFFF; --moss:#4B6B4F; --moss-dark:#37502F; --clay:#8B5E3C; --gold:#B08D1F; --line:#DBD7C6; --muted:#6B7566;
        font-family:'Inter',sans-serif; color:var(--ink); background:var(--canvas); min-height:600px; display:flex; flex-direction:column; border-radius:12px; overflow:hidden; }
      .sg-loading { align-items:center; justify-content:center; flex-direction:row; gap:8px; padding:60px; }
      .spin { animation:sg-spin 1s linear infinite; }
      @keyframes sg-spin { to { transform:rotate(360deg); } }
      .sg-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--line); background:var(--panel); }
      .sg-brand { display:flex; align-items:center; gap:8px; font-family:'Fraunces',serif; font-weight:600; font-size:24px; color:var(--moss-dark); }
      .sg-brand img { width:78px; height:78px; object-fit:cover; border-radius:50%; }
      .sg-reset { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); background:none; border:none; cursor:pointer; padding:6px 8px; border-radius:6px; }
      .sg-reset:hover { background:var(--canvas); }
      .sg-reset.sm { padding:4px 7px; font-size:11px; }
      .sg-weatherbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:8px 20px; background:#F4F6EE; border-bottom:1px solid var(--line); font-size:12.5px; }
      .sg-weatherbar.setup { color:var(--muted); }
      .sg-weather-actions { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .sg-chip { border:1px solid var(--line); background:#fff; border-radius:999px; padding:5px 10px; font-size:12px; cursor:pointer; color:var(--ink); }
      .sg-weather-loc { display:flex; align-items:center; gap:5px; font-weight:600; }
      .sg-weather-data { display:flex; align-items:center; gap:10px; color:var(--muted); }
      .sg-weather-err { color:#B23B34; }
      .sg-tabs { display:flex; gap:4px; padding:8px 16px; background:var(--panel); border-bottom:1px solid var(--line); }
      .sg-tabs button { display:flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px; border:none; background:none; font-size:13.5px; font-weight:500; color:var(--muted); cursor:pointer; font-family:'Inter',sans-serif; }
      .sg-tabs button.active { background:var(--canvas); color:var(--moss-dark); }
      .sg-main { flex:1; overflow-y:auto; padding:24px; }
      .sg-panel h1 { font-family:'Fraunces',serif; font-size:22px; font-weight:600; margin:0 0 4px; }
      .sg-panel h2 { font-size:14px; font-weight:600; margin:0 0 10px; color:var(--moss-dark); }
      .sg-sub { color:var(--muted); font-size:13.5px; margin:0 0 18px; max-width:60ch; }
      .sg-capture-box { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px; }
      .sg-capture-box textarea { width:100%; border:none; resize:vertical; font-family:'Inter',sans-serif; font-size:14px; outline:none; background:none; }
      .sg-capture-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; }
      .sg-primary, .sg-secondary { display:flex; align-items:center; gap:6px; border:none; border-radius:8px; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:'Inter',sans-serif; }
      .sg-primary { background:var(--moss); color:#fff; }
      .sg-primary:disabled { opacity:0.45; cursor:default; }
      .sg-secondary { background:var(--canvas); color:var(--ink); }
      .sg-secondary:disabled { opacity:0.45; cursor:default; }
      .sg-primary.sm, .sg-secondary.sm { padding:6px 10px; font-size:12px; }
      .sg-mic { display:flex; align-items:center; gap:6px; border:1px solid var(--line); background:#fff; border-radius:8px; padding:9px 12px; font-size:13px; cursor:pointer; }
      .sg-mic.on { background:#FDEDEC; border-color:#C0574C; color:#C0574C; }
      .sg-error { color:#B23B34; font-size:12.5px; margin-top:8px; }
      .sg-drafts { margin-top:22px; }
      .sg-drafts-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .sg-draft-card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px; margin-bottom:10px; display:flex; flex-direction:column; gap:8px; }
      .sg-draft-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .sg-form-label { font-size:11px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.03em; margin-top:2px; }
      .sg-pill { background:var(--canvas); color:var(--moss-dark); font-size:11px; font-weight:600; padding:3px 8px; border-radius:999px; }
      .sg-pill.muted { color:var(--muted); }
      .sg-icon-btn { margin-left:auto; background:none; border:none; cursor:pointer; color:var(--muted); }
      .sg-draft-payload { font-size:12px; color:var(--muted); font-family:monospace; word-break:break-all; }
      .sg-draft-note { font-size:12.5px; font-style:italic; color:var(--ink); }
      .sg-draft-card select, .sg-draft-card input { flex:1; border:1px solid var(--line); border-radius:6px; padding:7px 8px; font-size:13px; font-family:'Inter',sans-serif; background:#fff; min-width:110px; }
      .sg-soil-total { font-size:11px; color:var(--muted); padding:4px 8px; }
      .sg-soil-total.warn { color:var(--clay); font-weight:600; }
      .sg-photo-add { display:flex; align-items:center; gap:6px; border:1px dashed var(--line); border-radius:6px; padding:7px 10px; font-size:12px; color:var(--muted); cursor:pointer; background:#fff; }
      .sg-photo-add.wide { flex:1; }
      .sg-photo-thumb { position:relative; width:44px; height:44px; border-radius:6px; overflow:hidden; flex-shrink:0; }
      .sg-photo-thumb img { width:100%; height:100%; object-fit:cover; }
      .sg-photo-thumb button { position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.55); border:none; border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; }
      .sg-recent { margin-top:28px; }
      .sg-event-row { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); }
      .sg-evt-icon { color:var(--moss); margin-top:2px; flex-shrink:0; }
      .sg-event-title { font-size:13.5px; font-weight:500; }
      .sg-event-meta { font-size:12px; color:var(--muted); }
      .sg-event-thumb { width:32px; height:32px; border-radius:6px; object-fit:cover; margin-left:auto; }
      .sg-footnote { color:var(--muted); font-size:12px; margin-top:18px; }
      .sg-garden-overview { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px; }
      .sg-garden-row { display:flex; gap:10px; flex-wrap:wrap; }
      .sg-garden-name { font-family:'Fraunces',serif; font-size:17px; font-weight:600; border:none; background:none; padding:4px 2px; flex:1; min-width:160px; color:var(--ink); outline:none; }
      .sg-garden-row select { border:1px solid var(--line); border-radius:6px; padding:6px 8px; font-size:13px; font-family:'Inter',sans-serif; background:#fff; }
      .sg-garden-stats { display:flex; gap:22px; flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--line); }
      .sg-garden-stats div { display:flex; flex-direction:column; gap:2px; }
      .sg-garden-stats span { font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.03em; }
      .sg-garden-stats strong { font-size:14px; }
      .sg-garden-notes { border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:13px; font-family:'Inter',sans-serif; resize:vertical; background:#fff; }
      .sg-plant-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:14px; }
      .sg-plant-card { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; gap:10px; padding-bottom:14px; }
      .sg-cover { position:relative; width:100%; height:120px; background:var(--canvas); display:flex; align-items:center; justify-content:center; }
      .sg-cover img { width:100%; height:100%; object-fit:cover; }
      .sg-cover-generic { color:var(--moss); opacity:0.55; }
      .sg-cover-upload { position:absolute; bottom:6px; right:6px; background:#fff; border:1px solid var(--line); border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--moss-dark); }
      .sg-plant-head { display:flex; justify-content:space-between; align-items:flex-start; padding:0 14px; }
      .sg-plant-name { font-weight:600; font-size:14.5px; }
      .sg-plant-species { font-size:12px; color:var(--muted); font-style:italic; }
      .sg-stage { background:var(--canvas); color:var(--moss-dark); font-size:11px; font-weight:600; padding:3px 9px; border-radius:999px; text-transform:capitalize; }
      .sg-stage.ended { background:#F1EEE6; color:var(--muted); }
      .sg-plant-stats { display:flex; gap:14px; padding:0 14px; }
      .sg-plant-stats div { display:flex; flex-direction:column; gap:2px; }
      .sg-plant-stats span { font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.03em; }
      .sg-plant-stats strong { font-size:14px; }
      .sg-container-info { display:flex; flex-direction:column; gap:3px; padding:8px 14px 0; border-top:1px solid var(--line); margin:0 14px; font-size:11.5px; color:var(--muted); }
      .sg-container-info span { display:flex; align-items:center; gap:6px; }
      .sg-issue { display:flex; align-items:center; gap:6px; background:#FBF0E4; color:var(--clay); font-size:12px; padding:6px 8px; border-radius:6px; margin:0 14px; }
      .sg-reference { font-size:11.5px; color:var(--muted); border-top:1px solid var(--line); padding-top:8px; margin:0 14px; }
      .sg-chat-panel { display:flex; flex-direction:column; height:100%; }
      .sg-chat-thread { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding:10px 0; min-height:280px; }
      .sg-chat-empty { color:var(--muted); font-size:13px; padding:20px; text-align:center; }
      .sg-chat-msg { max-width:75%; padding:10px 13px; border-radius:12px; font-size:13.5px; line-height:1.5; white-space:pre-wrap; }
      .sg-chat-msg.user { align-self:flex-end; background:var(--moss); color:#fff; }
      .sg-chat-msg.assistant { align-self:flex-start; background:var(--panel); border:1px solid var(--line); }
      .sg-chat-input { display:flex; gap:8px; margin-top:12px; }
      .sg-chat-input input { flex:1; border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:13.5px; font-family:'Inter',sans-serif; }
    `}</style>
  );
}
