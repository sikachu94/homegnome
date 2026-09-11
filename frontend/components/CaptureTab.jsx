import { useState, useRef, useEffect } from "react";
import { Mic, Square, Sparkles, Loader2, X, ImagePlus, ChevronDown, Plus } from "lucide-react";
import { apiExtract } from "../api.js";
import {
  scopeOf, buildEvent, labelForEntity, labelForEventType, quickLogEvent, isAlertEvent, describeEventPayload,
  MANUAL_ENTRY_TYPES, MANUAL_ENTRY_LABELS, MANUAL_ENTRY_FIELDS, buildManualEvents,
} from "../lib/events.js";
import { uid, fmtTime, groupByDay } from "../lib/format.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { EventIcon } from "./EventIcon.jsx";
import { Reminders } from "./Reminders.jsx";
import { buildReminders, pickPriorityPlanting } from "../lib/reminders.js";

// How many of the most recent events to consider when building the day
// groups below — high enough that the "collapse older days" behavior has
// something real to collapse, without loading the whole history.
const RECENT_EVENT_WINDOW = 25;

// Default plant selection for the manual form: whoever's already flagged by
// a reminder for this action type, falling back to the single priority
// plant (same "whoever needs it most" logic the old quick actions used).
function defaultTargetsForType(type, plantings, events, weather) {
  const kindByType = { watering: "water", harvest: "harvest", pest_sighting: "issue", disease_sighting: "issue" };
  const kind = kindByType[type];
  if (kind) {
    const flagged = buildReminders(plantings, events, weather)
      .filter((r) => r.kind === kind)
      .map((r) => r.planting_id);
    if (flagged.length) return new Set(flagged);
  }
  const fallback = pickPriorityPlanting(plantings, events, weather);
  return fallback ? new Set([fallback.id]) : new Set();
}

export function CaptureTab({ gardenId, plantings, containers, events, addEvent, resetSignal, showToast, weather, onNewPlant, manualEntryRequest }) {
  const [note, setNote] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [listening, setListening] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [extractError, setExtractError] = useState(null);
  const [savingDraftId, setSavingDraftId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [quickBusy, setQuickBusy] = useState(null);
  const recognitionRef = useRef(null);
  const photoInputRef = useRef(null);
  const manualFormRef = useRef(null);

  // Manual log-entry form state — the primary, non-AI way to log activity.
  // manualFormOpen/manualMoreOpen keep the form collapsed to a slim trigger
  // row until someone actually wants to log something, instead of an
  // always-open card taking up most of the tab.
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualMoreOpen, setManualMoreOpen] = useState(false);
  const [manualType, setManualType] = useState("watering");
  const [manualTargets, setManualTargets] = useState(() => new Set());
  const [manualValues, setManualValues] = useState({});
  const [manualNote, setManualNote] = useState("");
  const [manualPhoto, setManualPhoto] = useState(null);
  const [manualSaving, setManualSaving] = useState(false);

  const notify = (message, kind = "success") => showToast?.(message, kind);

  const sortedEvents = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, RECENT_EVENT_WINDOW);
  const dayGroups = groupByDay(sortedEvents);

  // Today + yesterday (the first two day-groups at mount) start open; older
  // days start collapsed into a summary row — see the plan's Phase 3 notes
  // on treating the log as a scan, not a wall of rows.
  const [expandedDays, setExpandedDays] = useState(() => new Set(dayGroups.slice(0, 2).map((g) => g.label)));

  const selectManualType = (type) => {
    setManualType(type);
    setManualTargets(defaultTargetsForType(type, plantings, events, weather));
    setManualValues({});
    setManualNote("");
    setManualPhoto(null);
    setManualMoreOpen(false);
  };

  // Opens the form (if it's collapsed), switches it to the given type, and
  // optionally scopes it to one plant — the single entry point used by the
  // trigger chips below, the Measure/Pest quick actions, and cross-tab
  // requests from a plant's detail page.
  const openManualEntry = (type, plantingId) => {
    selectManualType(type);
    if (plantingId) setManualTargets(new Set([plantingId]));
    setManualFormOpen(true);
    requestAnimationFrame(() => manualFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const closeManualEntry = () => setManualFormOpen(false);

  // Tapping the already-open type's chip again collapses the form, so the
  // trigger row doubles as an open/close control.
  const handleTriggerClick = (type) => {
    if (manualFormOpen && manualType === type) { closeManualEntry(); return; }
    openManualEntry(type);
  };

  // Populate an initial default selection once plantings are available —
  // selectManualType only runs from then on when the person picks a chip,
  // switches tabs elsewhere, or a "Measure"/"Pest" quick action jumps here.
  useEffect(() => {
    setManualTargets((prev) => (prev.size ? prev : defaultTargetsForType(manualType, plantings, events, weather)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantings.length]);

  // A "Measure" / "Pest or disease" quick action on a specific plant's
  // detail page (PlantDetail.jsx) routes here via App's manualEntryRequest,
  // scoped to that one plant instead of the tab's own priority plant.
  useEffect(() => {
    if (!manualEntryRequest) return;
    openManualEntry(manualEntryRequest.type, manualEntryRequest.plantingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualEntryRequest]);

  // Demo reset clears drafts, collapses days back to the default state, and
  // resets the manual form to its default type/target — in-progress free
  // text is left alone, same as before.
  useEffect(() => {
    setDrafts([]);
    setNoteExpanded(false);
    setExpandedDays(new Set(dayGroups.slice(0, 2).map((g) => g.label)));
    selectManualType("watering");
    setManualFormOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const toggleDay = (label) => setExpandedDays((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });
  const dayHasAlert = (group) => group.items.some((e) => isAlertEvent(e.event_type));

  const reminders = buildReminders(plantings, events, weather);
  const priorityPlanting = plantings.length ? pickPriorityPlanting(plantings, events, weather) : null;

  const handleLogWatering = async (plantingId) => {
    try {
      await addEvent(quickLogEvent("watering", plantingId, gardenId));
      notify("Watered.");
    } catch (err) {
      notify("Couldn't save that — try again.", "error");
    }
  };

  const runQuickAction = async (eventType) => {
    if (!priorityPlanting) return;
    setQuickBusy(eventType);
    try {
      await addEvent(quickLogEvent(eventType, priorityPlanting.id, gardenId));
      notify(`${labelForEventType(eventType)} — ${priorityPlanting.nickname}.`);
    } catch (err) {
      notify("Couldn't save that — try again.", "error");
    } finally {
      setQuickBusy(null);
    }
  };

  const handleQuickPhoto = async (file) => {
    if (!file || !priorityPlanting) return;
    setQuickBusy("photo_log");
    try {
      const dataUrl = await fileToDataUrl(file);
      await addEvent(quickLogEvent("photo_log", priorityPlanting.id, gardenId, { media: [dataUrl] }));
      notify(`Photo added — ${priorityPlanting.nickname}.`);
    } catch (err) {
      notify("Couldn't attach that photo — try again.", "error");
    } finally {
      setQuickBusy(null);
    }
  };

  // "Measure" and "Pest / disease" can't log blind (no meaningful default
  // payload), so they jump to the manual form pre-scoped to the priority
  // plant instead of firing an event immediately.
  const focusManualEntry = (type) => {
    openManualEntry(type, priorityPlanting?.id);
  };

  const toggleTarget = (plantingId) => setManualTargets((prev) => {
    const next = new Set(prev);
    if (manualType === "photo_log") {
      next.clear();
      next.add(plantingId);
      return next;
    }
    if (next.has(plantingId)) next.delete(plantingId); else next.add(plantingId);
    return next;
  });
  const selectAllTargets = () => setManualTargets(new Set(plantings.map((p) => p.id)));

  const attachManualPhoto = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setManualPhoto(dataUrl);
    } catch (err) { console.error(err); }
  };

  const saveManualEntry = async () => {
    if (!manualTargets.size) return;
    if (manualType === "photo_log" && !manualPhoto) return;
    setManualSaving(true);
    const gardenScoped = scopeOf(manualType) === "garden";
    if (!gardenScoped && !manualTargets.size) return;
    if (manualType === "photo_log" && !manualPhoto) return;
    try {
      const fields = MANUAL_ENTRY_FIELDS[manualType] || [];
      const payload = {};
      for (const field of fields) {
        const raw = manualValues[field.key];
        if (raw === undefined || raw === "") continue;
        payload[field.key] = field.kind === "number" ? Number(raw) : raw;
      }
      const built = buildManualEvents({
        eventType: manualType,
        gardenId,
        plantingIds: Array.from(manualTargets),
        payload,
        note: manualNote.trim(),
        media: manualPhoto ? [manualPhoto] : undefined,
      });
      await addEvent(built);
      notify(`Logged ${MANUAL_ENTRY_LABELS[manualType].toLowerCase()} for ${built.length} ${built.length === 1 ? "plant" : "plants"}.`);
      setManualValues({});
      setManualNote("");
      setManualPhoto(null);
      setManualMoreOpen(false);
      setManualFormOpen(false);
    } catch (err) {
      notify("Couldn't save that — try again.", "error");
    } finally {
      setManualSaving(false);
    }
    const built = buildManualEvents({
      eventType: manualType,
      gardenId,
      plantingIds: gardenScoped ? [] : Array.from(manualTargets),
      payload,
      note: manualNote.trim(),
      media: manualPhoto ? [manualPhoto] : undefined,
    });
    await addEvent(built);
    notify(gardenScoped ? "Logged for the whole garden." : `Logged ${MANUAL_ENTRY_LABELS[manualType].toLowerCase()} for ${built.length} ${built.length === 1 ? "plant" : "plants"}.`);


  };

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

  const runExtraction = async () => {
    if (!note.trim()) return;
    setExtracting(true); setExtractError(null);
    try {
      // api/extract.py resolves "known plantings" for GARDEN_ID straight
      // from Supabase's `plantings` table, so drafts will only match
      // plantings that actually exist there — not the local demo/seed
      // plantings this app keeps in localStorage (see hooks/useGardenData.js).
      const { drafts: rawDrafts } = await apiExtract(gardenId, note);
      const withIds = (rawDrafts || []).map((d) => ({ ...d, draft_id: uid("draft"), media: [] }));
      setDrafts(withIds);
      if (!withIds.length) notify("Nothing to log in that note — try describing an action, like watering or a pest.", "error");
    } catch (err) {
      setExtractError("Couldn't read your note just now. Check your connection and that you're signed in, then try again.");
    } finally { setExtracting(false); }
  };

  function summarizeDraft(d) {
    const p = d.payload || {};
    switch (d.event_type) {
      case "watering":
        return `Watered${p.amount_l ? ` — ${p.amount_l}L` : ""}${p.method ? `, by ${p.method}` : ""}.`;
      case "harvest":
        return `Harvested${p.quantity ? ` ${p.quantity}${p.unit ? ` ${p.unit}` : ""}` : ""}${p.quality ? `, ${p.quality} quality` : ""}.`;
      case "pest_sighting":
        return `Spotted ${p.pest || "a pest"}${p.severity ? `, ${p.severity} severity` : ""}.`;
      case "disease_sighting":
        return `Signs of ${p.disease || "disease"}${p.severity ? `, ${p.severity}` : ""}.`;
      case "rainfall":
        return `${p.amount_mm ? `${p.amount_mm}mm of rain` : "Rain"} recorded.`;
      case "frost":
        return `Frost${p.severity ? ` (${p.severity})` : ""} recorded.`;
      case "growth_measurement":
        return `${p.metric || "Measurement"}: ${p.value ?? "—"}${p.unit ? ` ${p.unit}` : ""}.`;
      default:
        return "New entry.";
    }
  }

  const updateDraftPlanting = (draftId, plantingId) => setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, planting_id: plantingId } : d)));
  const discardDraft = (draftId) => setDrafts((ds) => ds.filter((d) => d.draft_id !== draftId));
  const attachDraftPhoto = async (draftId, file) => {
    if (!file) return;
    try { const dataUrl = await fileToDataUrl(file); setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, media: [dataUrl] } : d))); }
    catch (err) { console.error(err); }
  };
  const removeDraftPhoto = (draftId) => setDrafts((ds) => ds.map((d) => (d.draft_id === draftId ? { ...d, media: [] } : d)));

  const saveDraft = async (draft) => {
    if (scopeOf(draft.event_type) === "planting" && !draft.planting_id) return;
    setSavingDraftId(draft.draft_id);
    try {
      await addEvent(buildEvent(draft, gardenId));
      discardDraft(draft.draft_id);
      notify("Saved to your log.");
    } catch (err) {
      notify("Couldn't save that entry — try again.", "error");
    } finally {
      setSavingDraftId(null);
    }
  };

  const readyDrafts = drafts.filter((d) => scopeOf(d.event_type) === "garden" || d.planting_id);

  const saveAllDrafts = async () => {
    if (!readyDrafts.length) return;
    setSavingAll(true);
    try {
      await addEvent(readyDrafts.map((d) => buildEvent(d, gardenId)));
      setDrafts((ds) => ds.filter((d) => scopeOf(d.event_type) !== "garden" && !d.planting_id));
      setNote("");
      notify(`Saved ${readyDrafts.length} ${readyDrafts.length === 1 ? "entry" : "entries"} to your log.`);
    } catch (err) {
      notify("Couldn't save those entries — try again.", "error");
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <section className="sg-panel">
      <h1>What's happening in the garden?</h1>
      <p className="sg-sub">Log an entry, snap a photo, or speak or type a note — whichever's fastest.</p>

      {plantings.length > 0 && (
        <div className="sg-reminders-section">
          <h2>Needs attention</h2>
          <Reminders reminders={reminders} onLogWatering={handleLogWatering} />
        </div>
      )}

      <div className="sg-manual-section" ref={manualFormRef}>
        <p className="sg-form-label" style={{ margin: "18px 0 8px" }}>Log entry</p>

        <div className="sg-entry-trigger-row">
          {MANUAL_ENTRY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`sg-entry-trigger-chip${manualFormOpen && manualType === type ? " active" : ""}`}
              onClick={() => handleTriggerClick(type)}
              aria-pressed={manualFormOpen && manualType === type}
            >
              <EventIcon type={type} size={28} />
              <span>{MANUAL_ENTRY_LABELS[type]}</span>
            </button>
          ))}
        </div>

        {manualFormOpen && (
          <div className="sg-entry-sheet">
            <div className="sg-entry-sheet-head">
              <span>{MANUAL_ENTRY_LABELS[manualType]}</span>
              <button className="sg-icon-btn" onClick={closeManualEntry} aria-label="Close log entry form"><X size={16} /></button>
            </div>
            {scopeOf(manualType) !== "garden" && (
              <div className="sg-entry-targets">
                <div className="sg-target-header">
                  <span className="sg-form-label">Which plant{manualType !== "photo_log" ? "s" : ""}?</span>
                  {manualType !== "photo_log" && plantings.length > 1 && (
                    <button className="sg-select-all" onClick={selectAllTargets}>Select all</button>
                  )}
                </div>
                {plantings.length === 0 ? (
                  <p className="sg-empty">Add a plant first — see the Garden tab.</p>
                ) : (
                  <div className="sg-target-chips">
                    {plantings.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`sg-chip${manualTargets.has(p.id) ? " active" : ""}`}
                        aria-pressed={manualTargets.has(p.id)}
                        onClick={() => toggleTarget(p.id)}
                      >
                        {p.nickname}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {MANUAL_ENTRY_FIELDS[manualType].length > 0 && (
              <div className="sg-entry-fields">
                {MANUAL_ENTRY_FIELDS[manualType].map((field) => (
                  <label key={field.key} className="sg-entry-field">
                    <span>{field.label}</span>
                    {field.kind === "select" ? (
                      <select
                        value={manualValues[field.key] || ""}
                        onChange={(e) => setManualValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      >
                        <option value="">—</option>
                        {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.kind}
                        placeholder={field.placeholder || ""}
                        value={manualValues[field.key] || ""}
                        onChange={(e) => setManualValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>
            )}

            {manualType === "photo_log" && (
              <div className="sg-draft-row">
                {manualPhoto ? (
                  <div className="sg-photo-thumb"><img src={manualPhoto} alt="attached" /><button onClick={() => setManualPhoto(null)}><X size={10} /></button></div>
                ) : (
                  <label className="sg-photo-add wide">
                    <ImagePlus size={13} /> Add a photo
                    <input type="file" accept="image/*" hidden onChange={(e) => attachManualPhoto(e.target.files?.[0])} />
                  </label>
                )}
              </div>
            )}

            {!manualMoreOpen ? (
              <button className="sg-note-toggle" onClick={() => setManualMoreOpen(true)}>
                <Plus size={13} /> Add a note{manualType !== "photo_log" ? " or photo" : ""} (optional)
              </button>
            ) : (
              <div className="sg-entry-more">
                <textarea
                  className="sg-manual-note"
                  placeholder="Add a note (optional)"
                  rows={2}
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  autoFocus
                />
                {manualType !== "photo_log" && (
                  <div className="sg-draft-row">
                    {manualPhoto ? (
                      <div className="sg-photo-thumb"><img src={manualPhoto} alt="attached" /><button onClick={() => setManualPhoto(null)}><X size={10} /></button></div>
                    ) : (
                      <label className="sg-photo-add wide">
                        <ImagePlus size={13} /> Add a photo
                        <input type="file" accept="image/*" hidden onChange={(e) => attachManualPhoto(e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              className="sg-primary sg-entry-submit"
              disabled={manualSaving || (scopeOf(manualType) !== "garden" && manualTargets.size === 0) || (manualType === "photo_log" && !manualPhoto)}
              onClick={saveManualEntry}
            >
              {manualSaving ? <Loader2 className="spin" size={14} /> : null}
              Log for {manualTargets.size} {manualTargets.size === 1 ? "plant" : "plants"}
            </button>
          </div>
        )}
      </div>

      {!noteExpanded ? (
        <button className="sg-note-toggle" onClick={() => setNoteExpanded(true)}>
          <Mic size={14} /> Or describe it in your own words
        </button>
      ) : (
        <div className="sg-capture-box">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Watered the balcony tomato, and I think the basil has some aphids on the underside of the leaves" rows={4} autoFocus />
          <div className="sg-capture-actions">
            {speechSupported && (
              <button className={`sg-mic ${listening ? "on" : ""}`} onClick={toggleListening}>
                {listening ? <Square size={14} /> : <Mic size={14} />} {listening ? "Stop" : "Speak instead"}
              </button>
            )}
            <button className="sg-primary" disabled={!note.trim() || extracting} onClick={runExtraction}>
              {extracting ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />} Find events in this note
            </button>
          </div>
          {extractError && <div className="sg-error">{extractError}</div>}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="sg-drafts">
          <div className="sg-drafts-head">
            <h2>Found in your note</h2>
            <button className="sg-primary sm" disabled={!readyDrafts.length || savingAll} onClick={saveAllDrafts}>
              {savingAll ? <Loader2 className="spin" size={12} /> : null} Save all ({readyDrafts.length})
            </button>
          </div>
          {drafts.map((d) => {
            const needsPlant = scopeOf(d.event_type) === "planting" && !d.planting_id;
            return (
              <div key={d.draft_id} className="sg-draft-card">
                <div className="sg-draft-row">
                  <span className="sg-pill">{labelForEventType(d.event_type)}</span>
                  <button className="sg-icon-btn" onClick={() => discardDraft(d.draft_id)} aria-label="Discard this suggestion"><X size={14} /></button>
                </div>
                <div className="sg-draft-summary">{summarizeDraft(d)}</div>
                {d.note && <div className="sg-draft-note">"{d.note}"</div>}
                <div className="sg-draft-row">
                  {d.media?.length ? (
                    <div className="sg-photo-thumb"><img src={d.media[0]} alt="attached" /><button onClick={() => removeDraftPhoto(d.draft_id)}><X size={10} /></button></div>
                  ) : (
                    <label className="sg-photo-add"><Sparkles size={13} /><input type="file" accept="image/*" hidden onChange={(e) => attachDraftPhoto(d.draft_id, e.target.files?.[0])} /></label>
                  )}
                  {scopeOf(d.event_type) === "garden" ? (
                    <span className="sg-pill muted">Applies to the whole garden</span>
                  ) : (
                    <select value={d.planting_id || ""} onChange={(e) => updateDraftPlanting(d.draft_id, e.target.value)}>
                      <option value="">Which plant is this?</option>
                      {plantings.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                    </select>
                  )}
                  <button className="sg-secondary sm" disabled={needsPlant || savingDraftId === d.draft_id} onClick={() => saveDraft(d)}>
                    {savingDraftId === d.draft_id ? <Loader2 className="spin" size={12} /> : "Save"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sg-recent">
        <h2>Recent activity</h2>
        {dayGroups.length === 0 ? (
          <div className="sg-empty">Nothing logged yet. Try a quick action above, or write a note.</div>
        ) : (
          dayGroups.map((group) => {
            const isOpen = expandedDays.has(group.label);
            const alert = dayHasAlert(group);
            return (
              <div key={group.label} className="sg-day-group">
                {isOpen ? (
                  <button className="sg-day-label" onClick={() => toggleDay(group.label)} aria-expanded="true">{group.label}</button>
                ) : (
                  <button className={`sg-day-toggle ${alert ? "alert" : ""}`} onClick={() => toggleDay(group.label)} aria-expanded="false">
                    <span>{group.label} · {group.items.length} {group.items.length === 1 ? "entry" : "entries"}{alert ? " · needs attention" : ""}</span>
                    <ChevronDown size={14} />
                  </button>
                )}
                {isOpen && group.items.map((e) => {
                  const isAlert = isAlertEvent(e.event_type);
                  const entityLabel = labelForEntity(e, plantings, containers);
                  const detail = describeEventPayload(e.event_type, e.payload);
                  return (
                    <div key={e.id} className={`sg-event-row ${isAlert ? "alert" : ""}`}>
                      <EventIcon type={e.event_type} />
                      <div className="sg-event-body">
                        <div className="sg-event-title">{labelForEventType(e.event_type)}</div>
                        <div className="sg-event-meta">{detail ? `${entityLabel} · ${detail}` : entityLabel}</div>
                        {e.note && <div className="sg-event-note">"{e.note}"</div>}
                        {e.media?.length ? <img className="sg-event-thumb" src={e.media[0]} alt="" /> : null}
                      </div>
                      <div className="sg-event-time">{fmtTime(e.timestamp)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
      <p className="sg-footnote">Saved entries can't be edited yet — add a new one if something needs correcting.</p>
    </section>
  );
}