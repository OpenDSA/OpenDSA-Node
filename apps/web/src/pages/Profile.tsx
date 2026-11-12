import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { authFetch, useAuth } from "../auth/Auth";

interface ProfileData { email: string; first_name: string | null; last_name: string | null; time_zone_id: number | null }
interface TimeZone { id: number; name: string | null; zone: string | null; display_as: string | null }

export default function Profile() {
  const { user, refresh } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [zones, setZones] = useState<TimeZone[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  function showProfile(value: ProfileData) {
    setProfile(value); setFirstName(value.first_name || ""); setLastName(value.last_name || "");
    setTimeZone(value.time_zone_id == null ? "" : String(value.time_zone_id));
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    async function load(path: string) {
      const response = await fetch(path, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load your profile.");
      return body;
    }
    Promise.all([load("/api/profile"), load("/api/profile/time-zones")])
      .then(([result, options]) => {
        if (!controller.signal.aborted) { showProfile(result.user); setZones(options.data); }
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user?.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !profile) return;
    inFlight.current = true; setSubmitting(true); setError(""); setStatus("");
    try {
      const response = await authFetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, time_zone_id: timeZone ? Number(timeZone) : null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update your profile.");
      showProfile(body.user); await refresh(); setStatus("Profile updated.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update your profile."); }
    finally { inFlight.current = false; setSubmitting(false); }
  }

  return <div>
    <h1>Edit profile</h1>
    {location.state?.signedUp && !status && <p role="status">Welcome! You have signed up successfully. Please complete your profile.</p>}
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    {loading ? <p>Loading…</p> : profile && <form className="account-form" onSubmit={save}>
      <div className="account-field">
        <label htmlFor="profile-first-name">First name:</label>
        <input id="profile-first-name" autoComplete="given-name" maxLength={255} value={firstName}
          onChange={event => setFirstName(event.target.value)} disabled={submitting} />
      </div>
      <div className="account-field">
        <label htmlFor="profile-last-name">Last name:</label>
        <input id="profile-last-name" autoComplete="family-name" maxLength={255} value={lastName}
          onChange={event => setLastName(event.target.value)} disabled={submitting} />
      </div>
      <div className="account-field"><span>Email:</span><span>{profile.email}</span></div>
      <div className="account-field">
        <label htmlFor="profile-time-zone">Time zone:</label>
        <select id="profile-time-zone" value={timeZone} onChange={event => setTimeZone(event.target.value)} disabled={submitting}>
          <option value="">Select</option>
          {zones.map(zone => <option key={zone.id} value={zone.id}>{zone.display_as || zone.name || zone.zone || zone.id}</option>)}
        </select>
      </div>
      <div className="account-actions"><button type="submit" className="primary-button" disabled={submitting}>
        {submitting ? "Saving…" : "Update profile"}
      </button></div>
    </form>}
  </div>;
}
