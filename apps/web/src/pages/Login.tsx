import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
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
    <form onSubmit={login}>
      {error && <p role="alert">{error}</p>}
      <div><label htmlFor="login-email">Email: </label><input id="login-email" type="email" autoComplete="username"
        required maxLength={255} value={email} onChange={event => setEmail(event.target.value)} /></div>
      <div><label htmlFor="login-password">Password: </label><input id="login-password" type="password" autoComplete="current-password"
        required value={password} onChange={event => setPassword(event.target.value)} /></div>
      <button type="submit" disabled={submitting}>Sign in</button>
    </form>
  </div>;
}
