import { supabase, ensureDevSession } from "./Supabaseclient.js";

// Same-origin by default (fine for a Vercel deploy where the frontend and
// api/ live under one domain). Only set VITE_API_BASE_URL if the frontend
// is ever served from a different origin than the backend.
const BASE = import.meta.env.VITE_API_BASE_URL || "";

async function authHeader() {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) session = await ensureDevSession();
  return { Authorization: `Bearer ${session.access_token}` };
}

async function postJSON(path, body) {
  const headers = { "Content-Type": "application/json", ...(await authHeader()) };
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

async function patchJSON(path, body) {
  const headers = { "Content-Type": "application/json", ...(await authHeader()) };
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeader() });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}


async function deleteJSON(path) {
  const headers = await authHeader();
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

/**
 * POST /api/chat (api/chat.py)
 * messages: [{ role: "user" | "assistant", content: string }]
 * context: optional extra text the backend can't compute itself
 *          (weather, client-side projections, species reference data).
 * -> { reply: string }
 */
export function apiChat(gardenId, messages, context) {
  return postJSON("/api/chat", { garden_id: gardenId, messages, context });
}

/**
 * POST /api/extract (api/extract.py)
 * -> { drafts: [{ planting_id, event_type, category, payload, note }] }
 *
 * Note: the backend resolves "known plantings" for garden_id straight from
 * Supabase's `plantings` table — it has no idea about plantings that only
 * exist in this app's local demo/localStorage state.
 */
export function apiExtract(gardenId, note) {
  return postJSON("/api/extract", { garden_id: gardenId, note });
}

export function apiGardens() {
  return getJSON("/api/gardens");
}

export function apiCreatePlanting(gardenId, records) {
  return postJSON(`/api/gardens/${gardenId}/plantings`, records);
}

export function apiCreateEvent(gardenId, event) {
  return postJSON(`/api/gardens/${gardenId}/events`, event);
}

export function apiUpdateGarden(gardenId, patch) {
  return patchJSON(`/api/gardens/${gardenId}`, patch);
}


export function apiCreateGarden(garden) {
  return postJSON("/api/gardens", garden);
}

export function apiDeleteGarden(gardenId) {
  return deleteJSON(`/api/gardens/${gardenId}`);
}

export function apiUpdateEvent(gardenId, eventId, patch) {
  return patchJSON(`/api/gardens/${gardenId}/events/${eventId}`, patch);
}

export function apiDeleteEvent(gardenId, eventId) {
  return deleteJSON(`/api/gardens/${gardenId}/events/${eventId}`);
}