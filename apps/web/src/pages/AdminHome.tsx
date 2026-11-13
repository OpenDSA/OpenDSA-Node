import { apiFetch } from "../auth/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Person = { id: number; first_name: string | null; last_name: string | null; email: string };
type Dashboard = {
  term: { id: number; slug: string; starts_on: string; ends_on: string } | null;
  termIsCurrent: boolean;
  recentUsers: (Person & { current_sign_in_at: string; current_sign_in_ip: string | null })[];
  offerings: { id: number; label: string; archived: boolean | null;
    course: { id: number; name: string; number: string }; instructor: Person | null }[];
};
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
  return <div className="admin-dashboard">
    <h1>Administrator Dashboard</h1>
    <section>
      <h2>Current Term</h2>
      {!data.term ? <p>No terms have been created.</p> : <>
        {!data.termIsCurrent && <p>No term is currently active; showing the earliest configured term.</p>}
        <table><thead><tr><th>Term</th><th>Starts on</th><th>Ends on</th></tr></thead>
          <tbody><tr><td><Link to={`/admin/terms/${data.term.id}/show`}>{data.term.slug}</Link></td>
            <td>{date(data.term.starts_on)}</td><td>{date(data.term.ends_on)}</td></tr></tbody></table>
        <h2>Course Offerings</h2>
        {!data.offerings.length ? <p>No offerings for this term.</p> :
          <table><thead><tr><th>Course</th><th>Offering</th><th>Instructor</th><th>Archived</th></tr></thead>
            <tbody>{data.offerings.map(offering => <tr key={offering.id}>
              <td><Link to={`/admin/courses/${offering.course.id}/show`}>{offering.course.number}: {offering.course.name}</Link></td>
              <td><Link to={`/admin/course-offerings/${offering.id}/show`}>{offering.label}</Link></td>
              <td>{offering.instructor ? <Link to={`/admin/users/${offering.instructor.id}/show`}>{name(offering.instructor)}</Link> : "—"}</td>
              <td>{offering.archived ? "Yes" : "No"}</td>
            </tr>)}</tbody></table>}
      </>}
    </section>
    <section><h2>Recent Users</h2>
      {!data.recentUsers.length ? <p>No sign-ins have been recorded.</p> :
        <table><thead><tr><th>Name</th><th>Email</th><th>Latest sign-in</th><th>IP</th></tr></thead>
          <tbody>{data.recentUsers.map(user => <tr key={user.id}>
            <td><Link to={`/admin/users/${user.id}/show`}>{name(user)}</Link></td><td>{user.email}</td>
            <td>{date(user.current_sign_in_at, true)}</td><td>{user.current_sign_in_ip || "—"}</td>
          </tr>)}</tbody></table>}
    </section>
  </div>;
}
