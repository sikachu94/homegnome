import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy frontend/.env.example to frontend/.env and fill these in."
  );
}

// persistSession + autoRefreshToken keep people signed in across reloads.
// detectSessionInUrl is what lets Supabase pick the access token back up
// out of the URL once the Google OAuth redirect lands back on this page —
// see hooks/useAuth.js for the flow that uses it.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});