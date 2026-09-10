import { Droplets, Camera, Scissors, Ruler, Bug, Plus, Loader2 } from "lucide-react";

// Shared one-tap action bar used by both the Log tab (unscoped — acts on
// whichever plant needs it most) and a plant's zoom-in detail page (scoped
// to that plant). Keeping this in one component is what keeps the two
// screens from drifting apart visually.
//
// onWater/onHarvest log immediately with an empty payload (same as before).
// onMeasure/onIssue don't log blind — callers should route these into the
// manual entry form (Log tab) since those event types need fields.
// onPhotoClick triggers the caller's own hidden <input type="file"> ref.
// onNewPlant is optional — pass it to show a trailing "New plant" action.
export function QuickActions({ busy, disabled, onWater, onHarvest, onMeasure, onIssue, onPhotoClick, onNewPlant }) {
  const items = [
    { id: "watering", label: "Water", icon: Droplets, primary: true, onClick: onWater },
    { id: "photo_log", label: "Photo", icon: Camera, onClick: onPhotoClick },
    { id: "harvest", label: "Harvest", icon: Scissors, onClick: onHarvest },
    { id: "growth_measurement", label: "Measure", icon: Ruler, onClick: onMeasure },
    { id: "pest_sighting", label: "Pest / disease", icon: Bug, onClick: onIssue },
  ];

  return (
    <div className="sg-quick-actions">
      {items.map(({ id, label, icon: Icon, primary, onClick }) => (
        <button
          key={id}
          className={`sg-quick-btn${primary ? " primary" : ""}`}
          disabled={disabled || busy !== null}
          onClick={onClick}
        >
          {busy === id ? <Loader2 className="spin" size={18} /> : <Icon size={18} />} {label}
        </button>
      ))}
      {onNewPlant && (
        <button className="sg-quick-btn" disabled={busy !== null} onClick={onNewPlant}>
          <Plus size={18} /> New plant
        </button>
      )}
    </div>
  );
}