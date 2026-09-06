import { Box, Layers, MapPin, Bug, ImagePlus, Sprout, Apple, Leaf, Carrot, Flower2, Wheat, CircleCheck as CheckCircle2 } from "lucide-react";
import { SPECIES_META } from "../lib/species.js";
import { projectPlanting, projectContainer } from "../lib/projections.js";
import { fmtDate, formatComposition } from "../lib/format.js";
import { friendlyStage } from "../lib/reminders.js";

const HARVEST_ICON = { fruit: Apple, leaf: Leaf, root: Carrot, flower_bud: Flower2, seed_grain: Wheat, ornamental_flower: Flower2, ornamental_foliage: Leaf };

function GenericPlantImage({ harvestType, size = 28 }) {
  const Icon = HARVEST_ICON[harvestType] || Sprout;
  return <Icon size={size} />;
}

export function PlantCard({ planting, events, containers, addPlantingPhoto }) {
  const proj = projectPlanting(planting, events);
  const meta = SPECIES_META[planting.species];
  const container = containers.find((c) => c.id === proj.container_id);
  const contState = projectContainer(container, events);
  const coverImage = proj.cover_image || contState?.cover_image;
  const isReady = meta && proj.stage === meta.target_stage && proj.status === "active";
  const isBolting = meta?.flowering_signal === "decline_warning" && proj.stage === "flowering" && proj.status === "active";

  return (
    <div className="sg-plant-card">
      <div className="sg-cover">
        {coverImage ? <img src={coverImage} alt={planting.nickname} /> : <div className="sg-cover-generic"><GenericPlantImage harvestType={meta?.harvest_type} /></div>}
        <label className="sg-cover-upload" title="Add a photo"><ImagePlus size={13} /><input type="file" accept="image/*" hidden onChange={(e) => addPlantingPhoto(planting.id, e.target.files?.[0])} /></label>
      </div>
      <div className="sg-plant-head">
        <div><div className="sg-plant-name">{planting.nickname}</div><div className="sg-plant-species">{planting.species}</div></div>
        {isReady ? (
          <span className="sg-stage ready"><CheckCircle2 size={11} /> Ready</span>
        ) : isBolting ? (
          <span className="sg-stage ready">Harvest soon</span>
        ) : (
          <span className={`sg-stage ${proj.status === "ended" ? "ended" : ""}`}>{friendlyStage(proj.stage)}</span>
        )}
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
}
