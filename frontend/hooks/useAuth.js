import { useState, useEffect, useCallback } from "react";
import { supabase } from "../Supabaseclient.js";

/**
 * Owns the Supabase auth session for the whole app.
 *
 * `session` is one of three things:
 *   - undefined  while the initial session check is still in flight
 *   - null       once we know for sure nobody is signed in
 *   - a Session  once someone is signed in (any provider — Google, email/password, magic link)
 *
 * app.jsx uses those three states to show a loading screen, <AuthScreen>,
 * or the real app.
 */
export function useAuth() {
  const [session, setSession] = useState(undefined);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    // On success the browser navigates away to Google, so there's nothing
    // else to do here — only a failure to even *start* the redirect (e.g.
    // the Google provider isn't enabled in Supabase yet) lands in this branch.
    if (error) setAuthError(error.message);
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
      return false;
    }
    return true;
  }, []);

  const signUpWithEmail = useCallback(async (email, password) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setAuthError(error.message);
      return { ok: false, needsConfirmation: false };
    }
    // If "Confirm email" is on (the Supabase default), signUp succeeds but
    // doesn't hand back a session yet — the person has to click the link
    // in their inbox first.
    return { ok: true, needsConfirmation: !data.session };
  }, []);

  const sendMagicLink = useCallback(async (email) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setAuthError(error.message);
      return false;
    }
    return true;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading: session === undefined,
    authError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendMagicLink,
    signOut,
  };
}