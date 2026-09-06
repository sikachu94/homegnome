import { projectPlanting } from "./projections.js";
import { SPECIES_META } from "./species.js";
import { fmtDate } from "./format.js";

const DAY_MS = 86400000;

export function buildReminders(plantings, events, weather) {
  const reminders = [];

  for (const planting of plantings) {
    const proj = projectPlanting(planting, events);
    if (proj.status === "ended") continue;
    const meta = SPECIES_META[planting.species];
    if (!meta) continue;

    if (proj.stage === meta.target_stage) {
      reminders.push({
        planting_id: planting.id,
        nickname: planting.nickname,
        kind: "harvest",
        title: `${planting.nickname} is ready to harvest`,
        detail: `It's at the ${friendlyStage(proj.stage)} stage — pick when ripe.`,
      });
    }

    if (proj.last_watered_at) {
      const daysSinceWater = Math.floor((Date.now() - new Date(proj.last_watered_at).getTime()) / DAY_MS);
      const rainToday = weather?.daily?.precipitation_sum?.[0];
      const rainCovered = typeof rainToday === "number" && rainToday > 2;
      if (daysSinceWater >= meta.water_frequency_days && !rainCovered) {
        reminders.push({
          planting_id: planting.id,
          nickname: planting.nickname,
          kind: "water",
          title: `Water ${planting.nickname}`,
          detail: `Last watered ${fmtDate(proj.last_watered_at)} — about ${meta.water_frequency_days} days ago.`,
        });
      }
    } else {
      const age = proj.days_since_entry;
      if (age >= meta.water_frequency_days) {
        reminders.push({
          planting_id: planting.id,
          nickname: planting.nickname,
          kind: "water",
          title: `Water ${planting.nickname}`,
          detail: `No watering logged yet, and it's been ${age} days since planting.`,
        });
      }
    }

    if (meta.flowering_signal === "decline_warning" && proj.stage === "flowering") {
      reminders.push({
        planting_id: planting.id,
        nickname: planting.nickname,
        kind: "harvest",
        title: `Harvest ${planting.nickname} soon`,
        detail: `It's flowering, which means it's about to bolt. Harvest the leaves now.`,
      });
    }

    if (proj.open_issue) {
      const pest = proj.open_issue.payload?.pest || proj.open_issue.payload?.disease;
      reminders.push({
        planting_id: planting.id,
        nickname: planting.nickname,
        kind: "issue",
        title: `Check ${planting.nickname} for ${pest || "a problem"}`,
        detail: `Last reported ${fmtDate(proj.open_issue.timestamp)} — ${proj.open_issue.payload?.severity || "unspecified"} severity.`,
      });
    }
  }

  const order = { issue: 0, harvest: 1, water: 2 };
  return reminders.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
}

export function friendlyStage(stage) {
  const labels = {
    seed: "Seed",
    germinated: "Sprouted",
    seedling: "Seedling",
    vegetative: "Growing",
    budding: "Budding",
    flowering: "Flowering",
    fruiting: "Fruiting",
    seed_set: "Seeding",
    senescent: "Fading",
    dormant: "Dormant",
    mature: "Mature",
    unknown: "—",
  };
  return labels[stage] || stage;
}
