import { useState, useRef } from "react";
import { ChevronLeft, ChevronDown, Droplets, Camera, Scissors, Loader2, Box, Layers, MapPin, Bug, CircleCheck as CheckCircle2 } from "lucide-react";
import { SPECIES_META } from "../lib/species.js";
import { projectPlanting, projectContainer } from "../lib/projections.js";
import { fmtDate, fmtTime, formatComposition, groupByDay } from "../lib/format.js";
import { friendlyStage } from "../lib/reminders.js";
import { quickLogEvent, labelForEventType, isAlertEvent, describeEventPayload } from "../lib/events.js";
import { GenericPlantImage } from "./PlantCard.jsx";
import { EventIcon } from "./EventIcon.jsx";

/**
 * The "zoom in" screen for a single plant, reached by tapping its card in
 * the Garden tab. Shows the same quick-tap actions as the Log tab but
 * already scoped to this plant (no "which plant is this for?" step), plus
 * this plant's own history — including its current container's events
 * (soil/relocation), since "when did I last change the soil" belongs on
 * the plant's page even though those events are logged against the
 * container entity.
 */
export function PlantDetail({ planting, containers, events, garden, addEvent, addPlantingPhoto, showToast, onBack }) {
  const proj = projectPlanting(planting, events);
  const meta = SPECIES_META[planting.species];
  const container = containers.find((c) => c.id === proj.container_id);
  const contState = projectContainer(container, events);
  const coverImage = proj.cover_image || contState?.cover_image;
  const isReady = meta && proj.stage === meta.target_stage && proj.status === "active";
  const isBolting = meta?.flowering_signal === "decline_warning" && proj.stage === "flowering" && proj.status === "active";

  const [quickBusy, setQuickBusy] = useState(null);
  const photoInputRef = useRef(null);
  const notify = (message, kind = "success") => showToast?.(message, kind);

  const runQuick = async (eventType) => {
    setQuickBusy(eventType);
    try {
      await addEvent(quickLogEvent(eventType, planting.id, garden?.id));
      notify(`${labelForEventType(eventType)}.`);
    } catch (err) {
      notify("Couldn't save that — try again.", "error");
    } finally {
      setQuickBusy(null);
    }
  };

  const handlePhoto = async (file) => {
    if (!file) return;
    setQuickBusy("photo_log");
    try {
      await addPlantingPhoto(planting.id, file);
      notify("Photo added.");
    } catch (err) {
      notify("Couldn't attach that photo — try again.", "error");
    } finally {
      setQuickBusy(null);
    }
  };

  // This plant's own events, plus its current container's events (soil
  // amendments, relocations) — those are logged against the container
  // entity, but from the gardener's point of view they belong here too.
  const relevantEvents = events
    .filter((e) => (e.entity_type === "planting" && e.entity_id === planting.id) || (e.entity_type === "container" && container && e.entity_id === container.id))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const dayGroups = groupByDay(relevantEvents);
  const [visibleDays, setVisibleDays] = useState(2);
  const visibleGroups = dayGroups.slice(0, visibleDays);
  const hiddenCount = dayGroups.slice(visibleDays).reduce((sum, g) => sum + g.items.length, 0);

  return (
    <section className="sg-panel">
      <button className="sg-back-link" onClick={onBack}><ChevronLeft size={16} /> Garden</button>

      <div className="sg-plant-detail-head">
        <div className="sg-cover sm">
          {coverImage ? <img src={coverImage} alt={planting.nickname} /> : <div className="sg-cover-generic"><GenericPlantImage harvestType={meta?.harvest_type} size={26} /></div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sg-plant-name">{planting.nickname}</div>
          <div className="sg-plant-species">{planting.species}</div>
        </div>
        {isReady ? (
          <span className="sg-stage ready"><CheckCircle2 size={11} /> Ready</span>
        ) : isBolting ? (
          <span className="sg-stage ready">Harvest soon</span>
        ) : (
          <span className={`sg-stage ${proj.status === "ended" ? "ended" : ""}`}>{friendlyStage(proj.stage)}</span>
        )}
      </div>

      <div className="sg-plant-detail-stats">
        <div><span>Age</span><strong>{proj.days_since_entry}d</strong></div>
        <div><span>Watered</span><strong>{proj.last_watered_at ? fmtDate(proj.last_watered_at) : "—"}</strong></div>
        <div><span>Harvests</span><strong>{proj.harvest_count || "—"}</strong></div>
      </div>

      {container && (
        <div className="sg-container-info" style={{ margin: "0 0 16px", border: "none", padding: 0 }}>
          <span><Box size={12} /> {container.type.replace("_", " ")} · {container.material}{container.volume_l ? ` · ${container.volume_l}L` : ""}</span>
          <span><Layers size={12} /> {formatComposition(contState.soil_composition)}</span>
          <span><MapPin size={12} /> {contState.placement}</span>
        </div>
      )}

      {proj.open_issue && (
        <div className="sg-issue" style={{ margin: "0 0 16px" }}>
          <Bug size={13} /> {proj.open_issue.payload?.pest || proj.open_issue.payload?.disease} · {proj.open_issue.payload?.severity} · {fmtDate(proj.open_issue.timestamp)}
        </div>
      )}

      <div className="sg-quick-actions">
        <button className="sg-quick-btn primary" disabled={quickBusy !== null} onClick={() => runQuick("watering")}>
          {quickBusy === "watering" ? <Loader2 className="spin" size={18} /> : <Droplets size={18} />} Water
        </button>
        <button className="sg-quick-btn" disabled={quickBusy !== null} onClick={() => photoInputRef.current?.click()}>
          {quickBusy === "photo_log" ? <Loader2 className="spin" size={18} /> : <Camera size={18} />} Photo
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={(e) => { handlePhoto(e.target.files?.[0]); e.target.value = ""; }} />
        <button className="sg-quick-btn" disabled={quickBusy !== null} onClick={() => runQuick("harvest")}>
          {quickBusy === "harvest" ? <Loader2 className="spin" size={18} /> : <Scissors size={18} />} Harvest
        </button>
      </div>

      {meta && (
        <div className="sg-reference" style={{ margin: "0 0 18px", border: "none", padding: 0 }}>
          Ideal: {meta.sun_hours[0]}–{meta.sun_hours[1]}h sun · water ~every {meta.water_frequency_days}d · ~{meta.days_to_maturity}d to maturity
        </div>
      )}

      <div className="sg-recent">
        <h2>History</h2>
        {relevantEvents.length === 0 ? (
          <div className="sg-empty">Nothing logged for {planting.nickname} yet.</div>
        ) : (
          <>
            {visibleGroups.map((group) => (
              <div key={group.label} className="sg-day-group">
                <div className="sg-day-label">{group.label}</div>
                {group.items.map((e) => {
                  const isAlert = isAlertEvent(e.event_type);
                  const detail = describeEventPayload(e.event_type, e.payload);
                  return (
                    <div key={e.id} className={`sg-event-row ${isAlert ? "alert" : ""}`}>
                      <EventIcon type={e.event_type} />
                      <div className="sg-event-body">
                        <div className="sg-event-title">{labelForEventType(e.event_type)}</div>
                        {detail && <div className="sg-event-meta">{detail}</div>}
                        {e.note && <div className="sg-event-note">"{e.note}"</div>}
                        {e.media?.length ? <img className="sg-event-thumb" src={e.media[0]} alt="" /> : null}
                      </div>
                      <div className="sg-event-time">{fmtTime(e.timestamp)}</div>
                    </div>
                  );
                })}
              </div>
            ))}
            {hiddenCount > 0 && (
              <button className="sg-day-toggle" onClick={() => setVisibleDays(dayGroups.length)}>
                <span>{hiddenCount} earlier {hiddenCount === 1 ? "entry" : "entries"}</span>
                <ChevronDown size={14} />
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
