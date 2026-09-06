import { daysBetween } from "./format.js";

export function projectContainer(container, events) {
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

export function projectPlanting(planting, events) {
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
