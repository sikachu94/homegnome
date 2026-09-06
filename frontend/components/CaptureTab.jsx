import { useState, useRef, useEffect } from "react";
import { Mic, Square, Sparkles, Loader2, X, Camera } from "lucide-react";
import { apiExtract } from "../api.js";
import { scopeOf, buildEvent, labelForEntity, labelForEventType } from "../lib/events.js";
import { uid, fmtTime, groupByDay } from "../lib/format.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { EventIcon } from "./EventIcon.jsx";

export function CaptureTab({ gardenId, plantings, containers, events, addEvent, resetSignal, showToast }) {
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [extractError, setExtractError] = useState(null);
  const [savingDraftId, setSavingDraftId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const recognitionRef = useRef(null);

  const notify = (message, kind = "success") => showToast?.(message, kind);

  // Demo reset only clears drafts (matching the original scope) — the
  // in-progress note text is left alone, same as before.
  useEffect(() => { setDrafts([]); }, [resetSignal]);

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

  const dayGroups = groupByDay([...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 12));

  return (
    <section className="sg-panel">
      <h1>What's happening in the garden?</h1>
      <p className="sg-sub">Describe it in your own words. We'll turn it into log entries you can check before saving.</p>

      <div className="sg-capture-box">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Watered the balcony tomato, and I think the basil has some aphids on the underside of the leaves" rows={4} />
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
          <div className="sg-empty">Nothing logged yet. Write a note above to get started.</div>
        ) : (
          dayGroups.map((group) => (
            <div key={group.label} className="sg-day-group">
              <div className="sg-day-label">{group.label}</div>
              {group.items.map((e) => (
                <div key={e.id} className="sg-event-row">
                  <EventIcon type={e.event_type} />
                  <div>
                    <div className="sg-event-title">{labelForEntity(e, plantings, containers)} · {labelForEventType(e.event_type)}</div>
                    <div className="sg-event-meta">{fmtTime(e.timestamp)}{e.note ? ` — "${e.note}"` : ""}</div>
                  </div>
                  {e.media?.length ? <img className="sg-event-thumb" src={e.media[0]} alt="" /> : null}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <p className="sg-footnote">Saved entries can't be edited yet — add a new one if something needs correcting.</p>
    </section>
  );
}