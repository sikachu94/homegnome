import test from "node:test";
import assert from "node:assert/strict";
import { generateCalendarTasks, getMonthDays, groupCalendarItems } from "../lib/calendar.js";
import { buildPlantSearchQuery, plantSearchLabel } from "../lib/plantSearch.js";

const planting = { id: "p1", species: "Tomato", nickname: "Balcony tomato", started_at: "2026-09-01T10:00:00.000Z" };
const setup = { entity_type: "planting", entity_id: "p1", event_type: "planting_setup", timestamp: "2026-09-01T10:00:00.000Z", payload: { entry_stage: "seedling" } };

 test("generates watering on the species cadence after the last watering", () => {
  const events = [setup, { entity_type: "planting", entity_id: "p1", event_type: "watering", timestamp: "2026-09-05T09:00:00.000Z", payload: {} }];
  const tasks = generateCalendarTasks([planting], events, [], "2026-09-06");
  assert.equal(tasks.find((task) => task.type === "watering")?.due_date, "2026-09-07");
});

test("generates a harvest task when the planting reaches its target stage", () => {
  const events = [setup, { entity_type: "planting", entity_id: "p1", event_type: "stage_change", timestamp: "2026-09-05T09:00:00.000Z", payload: { to_stage: "fruiting" } }];
  const tasks = generateCalendarTasks([planting], events, [], "2026-09-06");
  assert.equal(tasks.find((task) => task.type === "harvest")?.due_date, "2026-09-06");
});

test("preserves a user override instead of regenerating an automatic task", () => {
  const existing = [{ id: "task-water", planting_id: "p1", type: "watering", due_date: "2026-09-10", status: "snoozed", source: "automatic" }];
  const tasks = generateCalendarTasks([planting], [setup], existing, "2026-09-06");
  assert.deepEqual(tasks.find((task) => task.id === "task-water"), existing[0]);
});

test("generates the next watering task after a completed task gets a new watering event", () => {
  const existing = [{ id: "task-water", planting_id: "p1", type: "watering", due_date: "2026-09-07", status: "completed", source: "automatic" }];
  const events = [setup, { entity_type: "planting", entity_id: "p1", event_type: "watering", timestamp: "2026-09-07T09:00:00.000Z", payload: {} }];
  const tasks = generateCalendarTasks([planting], events, existing, "2026-09-07");
  assert.equal(tasks.filter((task) => task.type === "watering").length, 2);
  assert.equal(tasks.find((task) => task.id !== "task-water" && task.type === "watering")?.due_date, "2026-09-09");
});

test("groups tasks and logged events by local calendar date", () => {
  const grouped = groupCalendarItems(
    [{ id: "task-1", due_date: "2026-09-06", type: "watering" }],
    [{ id: "event-1", timestamp: "2026-09-06T15:00:00.000Z", event_type: "watering" }],
  );
  assert.equal(grouped["2026-09-06"].tasks.length, 1);
  assert.equal(grouped["2026-09-06"].events.length, 1);
});

test("returns a six-week month grid", () => {
  const days = getMonthDays(new Date("2026-09-15T12:00:00.000Z"));
  assert.equal(days.length, 42);
});

test("builds a case-insensitive USDA catalog search", () => {
  assert.deepEqual(buildPlantSearchQuery("tom"), {
    search: "%tom%",
    limit: 20,
  });
});

test("formats a catalog result with its common and scientific names", () => {
  assert.equal(
    plantSearchLabel({ plant_name: "tomato", latin_name: "Solanum lycopersicum", usda_symbol: "SOLY2" }),
    "tomato · Solanum lycopersicum · SOLY2",
  );
});
