import { useState, useRef, useEffect } from "react";
import { Mic, Square, Sparkles, Loader2, X, Camera, Droplets, Scissors, ChevronDown } from "lucide-react";
import { apiExtract } from "../api.js";
import { scopeOf, buildEvent, labelForEntity, labelForEventType, quickLogEvent, isAlertEvent, describeEventPayload } from "../lib/events.js";
import { uid, fmtTime, groupByDay } from "../lib/format.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { EventIcon } from "./EventIcon.jsx";
import { pickPriorityPlanting } from "../lib/reminders.js";

// How many of the most recent events to consider when building the day
// groups below — high enough that the "collapse older days" behavior has
// something real to collapse, without loading the whole history.
const RECENT_EVENT_WINDOW = 25;

export function CaptureTab({ gardenId, plantings, containers, events, addEvent, resetSignal, showToast, weather }) {
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

  const notify = (message, kind = "success") => showToast?.(message, kind);

  const sortedEvents = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, RECENT_EVENT_WINDOW);
  const dayGroups = groupByDay(sortedEvents);

  // Today + yesterday (the first two day-groups at mount) start open; older
  // days start collapsed into a summary row — see the plan's Phase 3 notes
  // on treating the log as a scan, not a wall of rows.
  const [expandedDays, setExpandedDays] = useState(() => new Set(dayGroups.slice(0, 2).map((g) => g.label)));

  // Demo reset only clears drafts and collapses back to the default state —
  // the in-progress note text is left alone, same as before.
  useEffect(() => {
    setDrafts([]);
    setNoteExpanded(false);
    setExpandedDays(new Set(dayGroups.slice(0, 2).map((g) => g.label)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const toggleDay = (label) => setExpandedDays((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });
  const dayHasAlert = (group) => group.items.some((e) => isAlertEvent(e.event_type));

  const priorityPlanting = plantings.length ? pickPriorityPlanting(plantings, events, weather) : null;

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
      <p className="sg-sub">Water, snap a photo, or log a harvest in one tap — or describe anything else below.</p>

      {plantings.length > 0 && (
        <>
          <div className="sg-quick-actions">
            <button className="sg-quick-btn primary" disabled={quickBusy !== null || !priorityPlanting} onClick={() => runQuickAction("watering")}>
              {quickBusy === "watering" ? <Loader2 className="spin" size={18} /> : <Droplets size={18} />} Water
            </button>
            <button className="sg-quick-btn" disabled={quickBusy !== null || !priorityPlanting} onClick={() => photoInputRef.current?.click()}>
              {quickBusy === "photo_log" ? <Loader2 className="spin" size={18} /> : <Camera size={18} />} Photo
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={(e) => { handleQuickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            <button className="sg-quick-btn" disabled={quickBusy !== null || !priorityPlanting} onClick={() => runQuickAction("harvest")}>
              {quickBusy === "harvest" ? <Loader2 className="spin" size={18} /> : <Scissors size={18} />} Harvest
            </button>
          </div>
          {priorityPlanting && <p className="sg-quick-hint">Water targets {priorityPlanting.nickname} — whichever plant needs it most right now. Logging for someone else? Open their card in Garden instead.</p>}
        </>
      )}

      {!noteExpanded ? (
        <button className="sg-note-toggle" onClick={() => setNoteExpanded(true)}>
          <Sparkles size={14} /> Describe something else…
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
                    <label className="sg-photo-add"><Camera size={13} /><input type="file" accept="image/*" hidden onChange={(e) => attachDraftPhoto(d.draft_id, e.target.files?.[0])} /></label>
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
