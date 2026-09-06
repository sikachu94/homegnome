import { Droplets, Scissors, Bug, CircleCheck as CheckCircle2 } from "lucide-react";

const ICON = { water: Droplets, harvest: Scissors, issue: Bug };

export function Reminders({ reminders, onLogWatering }) {
  if (!reminders || reminders.length === 0) {
    return (
      <div className="sg-reminders-done">
        <CheckCircle2 size={16} />
        <span>All caught up — nothing needs attention right now.</span>
      </div>
    );
  }

  return (
    <div className="sg-reminders">
      {reminders.map((r, i) => {
        const Icon = ICON[r.kind] || Droplets;
        return (
          <div key={`${r.planting_id}-${r.kind}-${i}`} className={`sg-reminder-card sg-reminder-${r.kind}`}>
            <div className="sg-reminder-icon"><Icon size={16} /></div>
            <div className="sg-reminder-body">
              <div className="sg-reminder-title">{r.title}</div>
              <div className="sg-reminder-detail">{r.detail}</div>
            </div>
            {r.kind === "water" && onLogWatering && (
              <button className="sg-secondary sm" onClick={() => onLogWatering(r.planting_id)}>
                <Droplets size={12} /> Watered
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
