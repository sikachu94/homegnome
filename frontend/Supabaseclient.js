import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy frontend/.env.example to frontend/.env and fill these in."
  );
}

export const supabase = createClient(url, anonKey);

/**
 * TEMPORARY dev-only auth stub.
 *
 * There's no login/signup UI yet. api/deps.py's get_current_user requires a
 * real Supabase-issued bearer token on every /api/* request, so this signs
 * in with a fixed dev user (see .env.example) on first use, purely so the
 * app has *some* valid session to send. Swap this out for real sign-in /
 * sign-up screens later — everything downstream (getAuthToken in api.js)
 * only needs a valid session and doesn't care how it was obtained.
 *
 * For this to actually work end-to-end against your deployed backend:
 *   1. Create this user in Supabase Auth (email/password).
 *   2. Make sure a row exists in your `gardens` table with
 *      id = VITE_DEV_GARDEN_ID and user_id = that user's id — otherwise
 *      verify_garden_ownership() in api/deps.py will 404 every request.
 */
export async function ensureDevSession() {
  const { data: existing } = await supabase.auth.getSession();
  if (existing?.session) return existing.session;

  const email = import.meta.env.VITE_DEV_EMAIL;
  const password = import.meta.env.VITE_DEV_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "No Supabase session, and no VITE_DEV_EMAIL/VITE_DEV_PASSWORD set to stub one — see frontend/.env.example."
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}