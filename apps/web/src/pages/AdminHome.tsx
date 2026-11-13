import { apiFetch } from "../auth/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminFeatures } from "./adminFeatures";

type Person = { id: number; first_name: string | null; last_name: string | null; email: string };
type Dashboard = {
  term: { id: number; slug: string; starts_on: string; ends_on: string } | null;
  termIsCurrent: boolean;
  recentUsers: (Person & { current_sign_in_at: string; current_sign_in_ip: string | null })[];
  offerings: { id: number; label: string; archived: boolean | null;
    course: { id: number; name: string; number: string }; instructor: Person | null }[];
  // Not returned by the backend yet; the panel shows a notice until it is.
  recentErrors?: { id: number; class_name: string | null; message: string | null;
    target_url: string | null; created_at: string | null }[];
};
const clip = (value: string | null, length: number) =>
  !value ? "—" : value.length > length ? `${value.slice(0, length)}…` : value;

function RecentErrors({ errors }: { errors: Dashboard["recentErrors"] }) {
  if (!Array.isArray(errors)) return <p>Error tracking is not enabled yet.</p>;
  if (!errors.length) return <p>No errors have been recorded.</p>;
  const recent = [...errors].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 6);
  return <table><thead><tr><th>Class name</th><th>Message</th><th>URL</th><th>Time</th></tr></thead>
    <tbody>{recent.map(error => <tr key={error.id}>
      <td>{error.class_name || "—"}</td>
      <td>{adminFeatures.errors
        ? <Link to={`/admin/errors/${error.id}/show`}>{clip(error.message, 120)}</Link>
        : clip(error.message, 120)}</td>
      <td>{clip(error.target_url, 80)}</td>
      <td>{error.created_at ? date(error.created_at, true) : "—"}</td>
    </tr>)}</tbody></table>;
}
const name = (person: Person) => [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email;
const date = (value: string, time = false) => time ? new Date(value).toLocaleString() : value.slice(0, 10);

export default function AdminHome() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/admin/dashboard", { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load dashboard.");
      setData(body);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading dashboard…</p>;
  // The "Administrator Dashboard" title is rendered by AdminPageHeader in the admin layout.
  return <div className="admin-dashboard">
    <section className="admin-panel admin-errors" aria-labelledby="recent-errors-heading">
      <h2 id="recent-errors-heading">Recent Errors</h2>
      <RecentErrors errors={data.recentErrors} />
      {adminFeatures.errors && <p className="admin-panel-footer"><Link to="/admin/errors">View all errors</Link></p>}
    </section>
    <div className="admin-home-columns">
    <div className="admin-home-left">
    <section className="admin-panel">
      <h2>Current Term</h2>
      {!data.term ? <p>No terms have been created.</p> : <>
        {!data.termIsCurrent && <p>No term is currently active; showing the earliest configured term.</p>}
        <table><thead><tr><th>Term</th><th>Starts on</th><th>Ends on</th></tr></thead>
          <tbody><tr><td><Link to={`/admin/terms/${data.term.id}/show`}>{data.term.slug}</Link></td>
            <td>{date(data.term.starts_on)}</td><td>{date(data.term.ends_on)}</td></tr></tbody></table>
      </>}
    </section>
    <section className="admin-panel">
        <h2>Course Offerings</h2>
        {!data.offerings.length ? <p>No offerings for this term.</p> :
          <table><thead><tr><th>Course</th><th>Offering</th><th>Instructor</th><th>Archived</th></tr></thead>
            <tbody>{data.offerings.map(offering => <tr key={offering.id}>
              <td><Link to={`/admin/courses/${offering.course.id}/show`}>{offering.course.number}: {offering.course.name}</Link></td>
              <td><Link to={`/admin/course-offerings/${offering.id}/show`}>{offering.label}</Link></td>
              <td>{offering.instructor ? <Link to={`/admin/users/${offering.instructor.id}/show`}>{name(offering.instructor)}</Link> : "—"}</td>
              <td>{offering.archived ? "Yes" : "No"}</td>
            </tr>)}</tbody></table>}
    </section>
    </div>
    <section className="admin-panel"><h2>Recent Users</h2>
      {!data.recentUsers.length ? <p>No sign-ins have been recorded.</p> :
        <table><thead><tr><th>Name</th><th>Email</th><th>Latest sign-in</th><th>IP</th></tr></thead>
          <tbody>{data.recentUsers.map(user => <tr key={user.id}>
            <td><Link to={`/admin/users/${user.id}/show`}>{name(user)}</Link></td><td>{user.email}</td>
            <td>{date(user.current_sign_in_at, true)}</td><td>{user.current_sign_in_ip || "—"}</td>
          </tr>)}</tbody></table>}
    </section>
    </div>
  </div>;
}
