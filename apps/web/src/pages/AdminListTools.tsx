import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { List, useGetList, useListContext, type ListProps, type RaRecord } from "react-admin";
import { Link, useLocation } from "react-router-dom";

// [plural, singular] labels used by the page header and breadcrumbs.
export const adminResourceLabels: Record<string, [string, string]> = {
  organizations: ["Organizations", "Organization"], terms: ["Terms", "Term"],
  courses: ["Courses", "Course"], "course-offerings": ["Course Offerings", "Course Offering"],
  "course-roles": ["Course Roles", "Course Role"], roles: ["Global Roles", "Global Role"],
  "late-policies": ["Late Policies", "Late Policy"], "lms-types": ["LMS Types", "LMS Type"],
  "lms-instances": ["LMS Instances", "LMS Instance"], "lms-accesses": ["LMS Accesses", "LMS Access"],
  books: ["Inst Books", "Inst Book"], users: ["Users", "User"], errors: ["Errors", "Error"],
};

type Crumb = { label: string; to: string };
// Derives the title and breadcrumb from the react-admin URL shape:
// /admin/:resource, /admin/:resource/create, /admin/:resource/:id/show, /admin/:resource/:id (edit).
function headerFor(pathname: string): { title: string; crumbs: Crumb[] } | null {
  const parts = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const admin = { label: "Admin", to: "/admin" };
  if (!parts.length) return { title: "Administrator Dashboard", crumbs: [admin] };
  const labels = adminResourceLabels[parts[0]];
  if (!labels) return null;
  const [plural, singular] = labels;
  const list = { label: plural, to: `/admin/${parts[0]}` };
  if (parts.length === 1) return { title: plural, crumbs: [admin] };
  if (parts[1] === "create") return { title: `New ${singular}`, crumbs: [admin, list] };
  if (parts[2] === "show") return { title: `${singular} #${parts[1]}`, crumbs: [admin, list] };
  return { title: `Edit ${singular}`, crumbs: [admin, list, { label: `${singular} #${parts[1]}`, to: `/admin/${parts[0]}/${encodeURIComponent(parts[1])}/show` }] };
}

export function AdminPageHeader() {
  const { pathname } = useLocation();
  const header = headerFor(pathname);
  if (!header) return null;
  return <header className="admin-page-header">
    <nav aria-label="Breadcrumb" className="admin-page-breadcrumb">
      <ol>{header.crumbs.map(crumb => <li key={crumb.to}><Link to={crumb.to}>{crumb.label}</Link></li>)}</ol>
    </nav>
    <h1>{header.title}</h1>
  </header>;
}

export type FilterField = {
  source: string; label: string; placeholder?: string;
  type?: "text" | "date" | "select";
  // Options for a select: either fixed choices or records loaded from an existing admin list endpoint.
  choices?: { id: string | number; name: string }[];
  reference?: string; optionText?: (record: RaRecord) => string; referenceSort?: string;
};

function ReferenceOptions({ field }: { field: FilterField }) {
  const { data = [], isPending, error } = useGetList(field.reference!, {
    pagination: { page: 1, perPage: 100 }, sort: { field: field.referenceSort ?? "id", order: "ASC" },
  });
  if (isPending) return <option disabled>Loading…</option>;
  if (error) return <option disabled>Unable to load options</option>;
  return <>{data.map(record => <option key={record.id} value={String(record.id)}>{field.optionText?.(record) ?? String(record.id)}</option>)}</>;
}

const pick = (fields: FilterField[], values: Record<string, unknown>) =>
  Object.fromEntries(fields.flatMap(({ source }) => values[source] == null ? [] : [[source, String(values[source])]]));

// Sidebar filter form: values apply only on Search, so typing doesn't fire a request per keystroke.
// It uses react-admin's list state, so filters stay in the URL alongside sorting and pagination,
// and applying a filter returns to page 1.
export function AdminFilterPanel({ fields, validate }: { fields: FilterField[]; validate?: (values: Record<string, string>) => string | undefined }) {
  const { filterValues, setFilters } = useListContext();
  const id = useId();
  const applied = JSON.stringify(pick(fields, filterValues));
  const [values, setValues] = useState<Record<string, string>>(() => JSON.parse(applied));
  const [error, setError] = useState("");
  useEffect(() => { setValues(JSON.parse(applied)); }, [applied]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value !== ""));
    const message = validate?.(next);
    setError(message ?? "");
    if (!message) setFilters(next, {});
  }
  function clear() { setValues({}); setError(""); setFilters({}, {}); }
  return <aside className="admin-filters" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Filters</h2>
    <form onSubmit={submit} role="search">
      {fields.map(field => {
        const inputId = `${id}-${field.source}`;
        const value = values[field.source] ?? "";
        const change = (next: string) => setValues(current => ({ ...current, [field.source]: next }));
        return <div className="admin-filter-field" key={field.source}>
          <label htmlFor={inputId}>{field.label}</label>
          {field.type === "select" ? <select id={inputId} value={value} onChange={event => change(event.target.value)}>
            <option value="">Any</option>
            {field.reference ? <ReferenceOptions field={field} /> :
              field.choices?.map(choice => <option key={choice.id} value={String(choice.id)}>{choice.name}</option>)}
          </select> : <input id={inputId} type={field.type === "date" ? "date" : "search"} value={value}
            placeholder={field.placeholder} maxLength={255} onChange={event => change(event.target.value)} />}
        </div>;
      })}
      {error && <p role="alert" className="admin-filter-error">{error}</p>}
      <div className="admin-filter-actions">
        <button type="submit" className="admin-filter-submit">Search</button>
        <button type="button" onClick={clear}>Clear Filters</button>
      </div>
    </form>
  </aside>;
}

// react-admin List with the shared filter sidebar. By default it offers the free-text
// search (`q`) that every existing /api/admin list endpoint supports.
export function AdminList({ filters, searchPlaceholder, validateFilters, children, ...props }:
  Omit<ListProps, "filters" | "aside"> & { filters?: FilterField[]; searchPlaceholder?: string;
    validateFilters?: (values: Record<string, string>) => string | undefined; children: ReactNode }) {
  const fields = filters ?? [{ source: "q", label: "Search", placeholder: searchPlaceholder }];
  return <List exporter={false} {...props} aside={<AdminFilterPanel fields={fields} validate={validateFilters} />}>{children}</List>;
}
