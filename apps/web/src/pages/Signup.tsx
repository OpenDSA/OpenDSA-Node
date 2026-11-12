import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authFetch, useAuth } from "../auth/Auth";

export default function Signup() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError("");
    if (password !== confirmation) { setError("Password confirmation does not match."); return; }
    inFlight.current = true; setSubmitting(true);
    try {
      const response = await authFetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, password_confirmation: confirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to sign up.");
      setPassword(""); setConfirmation("");
      await refresh();
      navigate("/profile", { replace: true, state: { signedUp: true } });
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to sign up."); }
    finally { inFlight.current = false; setSubmitting(false); }
  }

  if (loading) return <p>Loading…</p>;
  if (user && !submitting) return <Navigate to="/profile" replace />;
  return <div>
    <h1>Sign up</h1>
    <form className="account-form" onSubmit={signup}>
      {error && <p role="alert">{error}</p>}
      <div className="account-field">
        <label htmlFor="signup-email">Email<span className="required-mark" aria-hidden="true">*</span>:</label>
        <input id="signup-email" type="email" autoComplete="username" required maxLength={255}
          value={email} onChange={event => setEmail(event.target.value)} disabled={submitting} />
      </div>
      <div className="account-field">
        <label htmlFor="signup-password">Password<span className="required-mark" aria-hidden="true">*</span>:</label>
        <input id="signup-password" type="password" autoComplete="new-password" required
          value={password} onChange={event => setPassword(event.target.value)} disabled={submitting} />
      </div>
      <div className="account-field">
        <label htmlFor="signup-confirmation">Confirm password<span className="required-mark" aria-hidden="true">*</span>:</label>
        <input id="signup-confirmation" type="password" autoComplete="new-password" required
          value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={submitting} />
      </div>
      <div className="account-actions">
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Signing up…" : "Sign up"}</button>
        <p>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </form>
  </div>;
}
