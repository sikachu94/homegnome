import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import gnomeLogo from "../assets/gnome_only.jpg";
import "./AuthScreen.css";

function GoogleIcon() {
    return (
        <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
        </svg>
    );
}

/**
 * Shown instead of the app whenever there's no Supabase session. Google is
 * the primary path; email/password and a passwordless magic link are there
 * as a fallback for people who'd rather not use Google.
 */
export function AuthScreen({ signInWithGoogle, signInWithEmail, signUpWithEmail, sendMagicLink, authError }) {
    const [mode, setMode] = useState("password"); // "password" | "magic"
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState(null);
    const [googleLoading, setGoogleLoading] = useState(false);

    const handleGoogle = async () => {
        setGoogleLoading(true);
        await signInWithGoogle();
        // If this line runs at all, the redirect never actually fired (popup
        // blocked, provider not enabled yet, etc.) — don't leave the button spinning.
        setGoogleLoading(false);
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password || submitting) return;
        setSubmitting(true);
        setNotice(null);
        try {
            if (isSignUp) {
                const { ok, needsConfirmation } = await signUpWithEmail(email.trim(), password);
                if (ok && needsConfirmation) setNotice("Almost there — check your email to confirm your account.");
            } else {
                await signInWithEmail(email.trim(), password);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleMagicSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || submitting) return;
        setSubmitting(true);
        setNotice(null);
        try {
            const ok = await sendMagicLink(email.trim());
            if (ok) setNotice("Check your email for a link to finish signing in.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="as-root">
            <img src={gnomeLogo} alt="myGnomie" className="as-gnome" />
            <h1 className="as-title">myGnomie Plant Log</h1>
            <p className="as-sub">Let's get planting, myGnomie</p>

            <button className="as-google-btn" type="button" onClick={handleGoogle} disabled={googleLoading}>
                {googleLoading ? <Loader2 className="spin" size={16} /> : <GoogleIcon />}
                Continue with Google
            </button>

            <div className="as-divider"><span>or</span></div>

            {notice ? (
                <p className="as-notice">{notice}</p>
            ) : mode === "magic" ? (
                <form className="as-form" onSubmit={handleMagicSubmit}>
                    <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                    <button className="as-submit" type="submit" disabled={submitting}>
                        {submitting ? <Loader2 className="spin" size={14} /> : <Mail size={14} />} Email me a link
                    </button>
                </form>
            ) : (
                <form className="as-form" onSubmit={handlePasswordSubmit}>
                    <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        minLength={6}
                        required
                    />
                    <button className="as-submit" type="submit" disabled={submitting}>
                        {submitting ? <Loader2 className="spin" size={14} /> : null} {isSignUp ? "Create account" : "Log in"}
                    </button>
                </form>
            )}

            {authError && <p className="as-error">{authError}</p>}

            {!notice && (
                <div className="as-links">
                    {mode === "password" ? (
                        <>
                            <button className="as-link" type="button" onClick={() => setIsSignUp((v) => !v)}>
                                {isSignUp ? "Already have an account? Log in" : "New here? Create an account"}
                            </button>
                            <button className="as-link" type="button" onClick={() => setMode("magic")}>Use an email link instead</button>
                        </>
                    ) : (
                        <button className="as-link" type="button" onClick={() => setMode("password")}>Use a password instead</button>
                    )}
                </div>
            )}
        </div>
    );
}