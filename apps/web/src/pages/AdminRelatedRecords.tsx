import { useRecordContext } from "react-admin";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

type Person = { id: number; first_name: string | null; last_name: string | null; email: string };
const personName = (user: Person) => [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
function Panel({ title, columns, rows }: { title: string; columns: string[]; rows: { id: number; cells: ReactNode[] }[] }) {
  return <section className="admin-related-panel">
    <h2>{title}</h2>
    {rows.length ? <div className="admin-related-scroll"><table><thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index}>{cell ?? "—"}</td>)}</tr>)}</tbody></table></div>
      : <p>No records.</p>}
  </section>;
}
export function OrganizationRelated() {
  const record = useRecordContext();
  if (!record) return null;
  return <div className="admin-related"><Panel title="Courses" columns={["Number", "Name"]}
    rows={(record.courses ?? []).map((course: { id: number; number: string; name: string }) => ({ id: course.id,
      cells: [course.number, <Link to={`/admin/courses/${course.id}/show`}>{course.name}</Link>] }))} /></div>;
}
export function TermRelated() {
  const record = useRecordContext();
  if (!record) return null;
  return <div className="admin-related"><Panel title="Course Offerings" columns={["Course", "Label"]}
    rows={(record.course_offerings ?? []).map((offering: { id: number; label: string; course: { id: number; number: string; organization: { abbreviation: string | null } } }) => ({ id: offering.id,
      cells: [<Link to={`/admin/courses/${offering.course.id}/show`}>{[offering.course.organization.abbreviation, offering.course.number].filter(Boolean).join(" ")}</Link>,
        <Link to={`/admin/course-offerings/${offering.id}/show`}>{offering.label}</Link>] }))} /></div>;
}
export function OfferingRelated() {
  const record = useRecordContext();
  if (!record) return null;
  const enrollments = record.course_enrollments ?? [];
  const students = enrollments.filter((row: { course_role_id: number }) => row.course_role_id === 2);
  const instructors = enrollments.filter((row: { course_role_id: number }) => row.course_role_id === 1);
  return <div className="admin-related admin-related-offering"><div>
    <Panel title="OpenDSA Books" columns={["ID", "Title", "Book Description"]}
      rows={(record.inst_books ?? []).map((book: { id: number; title: string; desc: string | null }) => ({ id: book.id,
        cells: [book.id, <Link to={`/admin/books/${book.id}/show`}>{book.title}</Link>, book.desc] }))} />
    <Panel title="Roster" columns={["Name", "Email"]} rows={students.map(({ user }: { user: Person }) => ({ id: user.id, cells: [personName(user), user.email] }))} />
  </div>{instructors.length > 0 && <aside><Panel title="Instructors" columns={["Name", "Email"]}
    rows={instructors.map(({ user }: { user: Person }) => ({ id: user.id, cells: [<Link to={`/admin/users/${user.id}/show`}>{personName(user)}</Link>,
      <a href={`mailto:${user.email}`}>{user.email}</a>] }))} /></aside>}</div>;
}
