import { useState, useRef, useEffect } from "react";
import { Mic, Square, Sparkles, Loader2, X, Camera } from "lucide-react";
import { apiExtract } from "../api.js";
import { GARDEN_ID } from "../lib/seedData.js";
import { scopeOf, buildEvent, labelForEntity } from "../lib/events.js";
import { uid, fmtDateTime } from "../lib/format.js";
import { fileToDataUrl } from "../lib/imageUtils.js";
import { EventIcon } from "./EventIcon.jsx";

export function CaptureTab({ plantings, containers, events, addEvent, resetSignal }) {
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [extractError, setExtractError] = useState(null);
  const recognitionRef = useRef(null);

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
      const { drafts: rawDrafts } = await apiExtract(GARDEN_ID, note);
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

  const saveDraft = async (draft) => {
    if (scopeOf(draft.event_type) === "planting" && !draft.planting_id) return;
    await addEvent(buildEvent(draft, GARDEN_ID));
    discardDraft(draft.draft_id);
  };

  const saveAllDrafts = async () => {
    const ready = drafts.filter((d) => scopeOf(d.event_type) === "garden" || d.planting_id);
    if (!ready.length) return;
    await addEvent(ready.map((d) => buildEvent(d, GARDEN_ID)));
    setDrafts((ds) => ds.filter((d) => scopeOf(d.event_type) !== "garden" && !d.planting_id));
    setNote("");
  };

  return (
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
        {[...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8).map((e) => (
          <div key={e.id} className="sg-event-row">
            <EventIcon type={e.event_type} />
            <div>
              <div className="sg-event-title">{labelForEntity(e, plantings, containers)} · {e.event_type.replace("_", " ")}</div>
              <div className="sg-event-meta">{fmtDateTime(e.timestamp)}{e.note ? ` — "${e.note}"` : ""}</div>
            </div>
            {e.media?.length ? <img className="sg-event-thumb" src={e.media[0]} alt="" /> : null}
          </div>
        ))}
      </div>
      <p className="sg-footnote">Every save adds an event - nothing can be edit (yet).</p>
    </section>
  );
}
