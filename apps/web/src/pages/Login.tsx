import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { authFetch, useAuth } from "../auth/Auth";

export default function Login() {
  const { user, refresh } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false);
  const from = location.state?.from;
  const destination = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && from !== "/login" ? from : "/courses";
  if (user) return <Navigate to={destination} replace />;
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting) return;
    setSubmitting(true); setError("");
    try {
      const response = await authFetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to sign in.");
      setPassword(""); await refresh(); navigate(destination, { replace: true });
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to sign in."); }
    finally { setSubmitting(false); }
  }
  return <div>
    <h1>Sign in</h1>
    <form className="account-form" onSubmit={login}>
      {error && <p role="alert">{error}</p>}
      <div className="account-field">
        <label htmlFor="login-email">Email<span className="required-mark" aria-hidden="true">*</span>:</label>
        <input id="login-email" type="email" autoComplete="username" required maxLength={255}
          value={email} onChange={event => setEmail(event.target.value)} disabled={submitting} />
      </div>
      <div className="account-field">
        <label htmlFor="login-password">Password<span className="required-mark" aria-hidden="true">*</span>:</label>
        <input id="login-password" type="password" autoComplete="current-password" required
          value={password} onChange={event => setPassword(event.target.value)} disabled={submitting} />
      </div>
      <div className="account-actions">
        <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        <p>Need an account? <Link to="/signup">Sign up</Link></p>
      </div>
    </form>
  </div>;
}
