import { apiFetch } from "../auth/api";
import {
  Admin, Resource, Datagrid, TextField, NumberField, DateField, Show,
  BooleanField, SelectField, SimpleShowLayout, Notification, HttpError,
  Edit, SimpleForm, TextInput, ReferenceInput, SelectInput, Toolbar, SaveButton,
  EditButton, required, email, maxLength, useNotify, useRedirect,
  type DataProvider, type LayoutProps, type RaRecord, type DeleteParams, type DeleteResult,
} from "react-admin";
import { useState, type ReactNode } from "react";
import { AdminCreate, AdminEdit, seasons } from "./AdminForms";
import { NavLink, Link, useNavigate } from "react-router-dom";
import "./admin.css";
import AdminHome from "./AdminHome";
import { authFetch, useAuth } from "../auth/Auth";
import { AdminList, AdminPageHeader } from "./AdminListTools";
import { adminFeatures } from "./adminFeatures";
import { LmsAccessesList, LmsAccessShow, LmsAccessEdit, LmsAccessCreate } from "./AdminLmsAccesses";
import { ErrorsList, ErrorShow } from "./AdminErrors";

// Write-only credentials: dropped from every response before react-admin caches it,
// even if an endpoint returns them by mistake.
const writeOnlyFields: Record<string, string[]> = { "lms-accesses": ["access_token", "consumer_secret"] };
function withoutSecrets<T>(resource: string, body: T): T {
  const hidden = writeOnlyFields[resource];
  const data = (body as { data?: unknown } | null)?.data;
  if (!hidden || !data) return body;
  const strip = (record: unknown) => record && typeof record === "object"
    ? Object.fromEntries(Object.entries(record).filter(([key]) => !hidden.includes(key))) : record;
  return { ...body, data: Array.isArray(data) ? data.map(strip) : strip(data) } as T;
}
// Explicit resources and fields keep credentials out of the admin interface.
async function read(resource: string, suffix: string) {
  if (!["organizations", "terms", "courses", "course-offerings", "books", "users", "roles", "course-roles", "late-policies", "lms-types", "lms-instances", "lms-accesses", "errors"].includes(resource)) throw new Error("Unknown resource.");
  const response = await apiFetch(`/api/admin/${resource}${suffix}`);
  const body = await response.json();
  if (!response.ok) throw new HttpError(body.error || "Request failed.", response.status, body);
  return withoutSecrets(resource, body);
}
// Field filters beyond `q`; existing endpoints reject unknown query parameters, so these are per resource.
const listFilters: Record<string, string[]> = {
  "lms-accesses": ["email", "lms_instance_id", "user_id"],
  errors: ["class_name", "message", "created_from", "created_to"],
};
const editableFields: Record<string, string[]> = {
  users: ["first_name", "last_name", "email", "global_role_id"],
  organizations: ["name", "abbreviation"], terms: ["season", "year", "starts_on", "ends_on"],
  courses: ["name", "number", "organization_id", "user_id"],
  "course-offerings": ["course_id", "term_id", "label", "lms_instance_id", "lms_course_code", "lms_course_num", "archived"],
  "course-roles": ["name", "can_manage_course", "can_manage_assignments", "can_grade_submissions", "can_view_other_submissions"],
  "late-policies": ["name", "late_days", "late_percent"], "lms-types": ["name"],
  "lms-instances": ["url", "lms_type_id", "organization_id", "consumer_key", "consumer_secret", "client_id",
    "private_key", "public_key", "keyset_url", "oauth2_url", "platform_oidc_auth_url", "issuer"],
  "lms-accesses": ["lms_instance_id", "user_id", "access_token", "consumer_key", "consumer_secret"],
};
async function write(resource: string, data: Record<string, unknown>, id?: string | number) {
  if (!editableFields[resource] || (resource === "users" && id === undefined)) throw new Error("This operation is not supported.");
  // A blank write-only credential means "keep the current value", so it is not sent.
  const input = Object.fromEntries(editableFields[resource].filter(key => key in data &&
    !(writeOnlyFields[resource]?.includes(key) && (data[key] == null || data[key] === ""))).map(key =>
    [key, ["starts_on", "ends_on"].includes(key) && typeof data[key] === "string" ? data[key].slice(0, 10) : data[key]]));
  const response = await authFetch(`/api/admin/${resource}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`, {
    method: id === undefined ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) throw new HttpError(body.error || "Unable to save record.", response.status, body);
  return withoutSecrets(resource, body);
}
const unsupported = async (): Promise<never> => { throw new Error("This operation is not supported."); };
// Only LMS accesses can be deleted, and only once the backend endpoint exists.
async function remove<RecordType extends RaRecord>(resource: string, params: DeleteParams<RecordType>): Promise<DeleteResult<RecordType>> {
  if (resource !== "lms-accesses" || !adminFeatures.lmsAccessDelete) return unsupported();
  const response = await authFetch(`/api/admin/${resource}/${encodeURIComponent(params.id)}`, { method: "DELETE" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(body.error || "Unable to delete record.", response.status, body);
  return { data: (params.previousData ?? { id: params.id }) as RecordType };
}
const dataProvider: DataProvider = {
  getList: (resource, params) => {
    const query = new URLSearchParams({
      page: String(params.pagination?.page ?? 1), per_page: String(params.pagination?.perPage ?? 25),
      sort: params.sort?.field ?? "id", order: params.sort?.order ?? "ASC",
      q: params.filter?.q ?? "",
    });
    for (const key of listFilters[resource] ?? []) {
      const value = params.filter?.[key];
      if (value != null && String(value).trim() !== "") query.set(key, String(value).trim());
    }
    return read(resource, `?${query}`);
  },
  getOne: (resource, params) => read(resource, `/${encodeURIComponent(params.id)}`),
  getMany: async (resource, params) => {
    const records = await Promise.all(params.ids.map(id => read(resource, `/${encodeURIComponent(id)}`)));
    return { data: records.map(record => record.data) };
  }, getManyReference: unsupported,
  create: (resource, params) => write(resource, params.data),
  update: (resource, params) => write(resource, params.data, params.id),
  updateMany: unsupported,
  delete: remove, deleteMany: unsupported,
};
function AdminDropdown({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="admin-nav-group" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{label} ▾</button>
    <div hidden={!open} onClick={() => setOpen(false)}>{children}</div>
  </div>;
}
function AdminLayout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  async function signOut() {
    try { await logout(); navigate("/login"); } catch { setError("Sign out failed. Please retry."); }
  }
  return <div className="admin-shell">
    <nav className="admin-navigation" aria-label="Administration">
      <Link to="/" className="admin-brand">OpenDSA</Link>
      <Link to="/" className="admin-back">← Back to OpenDSA</Link>
      <NavLink to="/admin" end>Dashboard</NavLink>
      <AdminDropdown label="University-oriented">
        {[["organizations", "Organizations"], ["terms", "Terms"], ["courses", "Courses"],
          ["course-offerings", "Course Offerings"], ["course-roles", "Course Roles"],
          ["roles", "Global Roles"], ["late-policies", "Late Policies"]].map(([path, label]) =>
          <NavLink key={path} to={`/admin/${path}`}>{label}</NavLink>)}
      </AdminDropdown>
      <AdminDropdown label="LMS Config">
        <NavLink to="/admin/lms-types">LMS Types</NavLink>
        <NavLink to="/admin/lms-instances">LMS Instances</NavLink>
        {adminFeatures.lmsAccesses && <NavLink to="/admin/lms-accesses">LMS Accesses</NavLink>}
      </AdminDropdown>
      <AdminDropdown label="OpenDSA Books">
        <NavLink to="/admin/books">Book Instances</NavLink>
      </AdminDropdown>
      <NavLink to="/admin/users">Users</NavLink>
      {adminFeatures.errors && <NavLink to="/admin/errors">Errors</NavLink>}
      <Link to="/profile" className="admin-user">{[user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email}</Link>
      <button type="button" onClick={signOut}>Sign out</button>
    </nav>
    {error && <p role="alert">{error}</p>}
    <AdminPageHeader />
    <div className="admin-content">{children}</div>
    <Notification />
  </div>;
}
function OrganizationsList() {
  return <AdminList searchPlaceholder="Name or abbreviation" sort={{ field: "name", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="name" /><TextField source="abbreviation" />
      <DateField source="created_at" />
      <EditButton />
    </Datagrid>
  </AdminList>;
}
function OrganizationShow() {
  return <Show><SimpleShowLayout>
    <TextField source="id" /><TextField source="name" /><TextField source="abbreviation" />
    <TextField source="slug" /><DateField source="created_at" />
  </SimpleShowLayout></Show>;
}
function TermsList() {
  return <AdminList searchPlaceholder="Term (e.g. fall-2026)" sort={{ field: "starts_on", order: "DESC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="slug" sortable={false} label="Term" />
      <TextField source="year" /><DateField source="starts_on" /><DateField source="ends_on" />
      <EditButton />
    </Datagrid>
  </AdminList>;
}
function TermShow() {
  return <Show><SimpleShowLayout>
    <TextField source="id" /><TextField source="slug" label="Term" /><SelectField source="season" choices={seasons} />
    <TextField source="year" /><DateField source="starts_on" /><DateField source="ends_on" />
  </SimpleShowLayout></Show>;
}
function CoursesList() {
  return <AdminList searchPlaceholder="Course name or number" sort={{ field: "name", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="number" /><TextField source="name" />
      <TextField source="organization.name" label="Organization" sortable={false} />
      <EditButton />
    </Datagrid>
  </AdminList>;
}
function CourseShow() {
  return <Show><SimpleShowLayout>
    <TextField source="id" /><TextField source="number" /><TextField source="name" />
    <TextField source="organization.name" label="Organization" /><TextField source="organization_id" />
    <TextField source="user_id" label="Owner user ID" /><TextField source="slug" />
    <DateField source="created_at" /><DateField source="updated_at" />
  </SimpleShowLayout></Show>;
}
function OfferingsList() {
  return <AdminList searchPlaceholder="Offering label" sort={{ field: "created_at", order: "DESC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="label" />
      <TextField source="course.number" label="Course number" sortable={false} />
      <TextField source="course.name" label="Course" sortable={false} />
      <TextField source="term.slug" label="Term" sortable={false} />
      <TextField source="lms_course_num" label="LMS course number" /><BooleanField source="archived" />
      <EditButton />
    </Datagrid>
  </AdminList>;
}
function OfferingShow() {
  return <Show><SimpleShowLayout>
    <TextField source="id" /><TextField source="label" />
    <TextField source="course.name" label="Course" /><TextField source="course_id" />
    <TextField source="term.slug" label="Term" /><TextField source="term_id" />
    <TextField source="lms_instance_id" label="LMS instance ID" />
    <TextField source="lms_course_num" label="LMS course number" />
    <TextField source="lms_course_code" label="LMS course code" /><TextField source="url" />
    <BooleanField source="archived" /><BooleanField source="self_enrollment_allowed" />
    <DateField source="cutoff_date" /><TextField source="late_policy_id" />
    <DateField source="created_at" /><DateField source="updated_at" />
  </SimpleShowLayout></Show>;
}
function BooksList() {
  return( 
  // The "Admin / Inst Books" header is rendered by AdminPageHeader in the layout.
  <div className="admin-books-page">
    <AdminList searchPlaceholder="Book title" sort={{ field: "title", order: "ASC" }}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" /><TextField source="title" /><BooleanField source="template" />
        <TextField source="user.email" label="Owner" sortable={false} />
        <TextField source="course_offering.label" label="Offering" sortable={false} />
        <DateField source="last_compiled" showTime emptyText="Not compiled" />
      </Datagrid>
    </AdminList>
  </div>
  )
}
function BookShow() {
  return <Show actions={false}><SimpleShowLayout>
    <TextField source="id" /><TextField source="title" /><TextField source="desc" label="Description" />
    <BooleanField source="template" /><TextField source="book_type" />
    <TextField source="user.email" label="Owner" /><TextField source="user_id" label="Owner user ID" />
    <TextField source="course_offering.label" label="Offering" /><TextField source="course_offering_id" />
    <DateField source="last_compiled" showTime emptyText="Not compiled" />
    <DateField source="created_at" /><DateField source="updated_at" />
  </SimpleShowLayout></Show>;
}
function UsersList() {
  return <AdminList searchPlaceholder="Email or name" sort={{ field: "email", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="email" /><TextField source="first_name" />
      <TextField source="last_name" /><TextField source="global_role.name" label="Role" sortable={false} />
      <DateField source="created_at" showTime /><DateField source="current_sign_in_at" label="Latest sign-in" showTime />
      <NumberField source="sign_in_count" /><EditButton />
    </Datagrid>
  </AdminList>;
}
function UserShow() {
  return <Show><SimpleShowLayout>
    <TextField source="id" /><TextField source="email" /><TextField source="first_name" />
    <TextField source="last_name" /><TextField source="global_role.name" label="Role" />
    <TextField source="global_role_id" /><TextField source="time_zone_id" />
    <DateField source="created_at" showTime /><DateField source="updated_at" showTime />
    <NumberField source="sign_in_count" />
    <DateField source="current_sign_in_at" label="Latest sign-in" showTime />
    <DateField source="last_sign_in_at" label="Previous sign-in" showTime />
    <TextField source="current_sign_in_ip" label="Latest sign-in IP" />
    <TextField source="last_sign_in_ip" label="Previous sign-in IP" />
  </SimpleShowLayout></Show>;
}
function UserEdit() {
  const { refresh } = useAuth();
  const notify = useNotify();
  const redirect = useRedirect();
  return <Edit mutationMode="pessimistic" mutationOptions={{ onSuccess: async (data) => {
    notify("User updated.", { type: "success" });
    redirect("show", "users", data.id);
    await refresh();
  } }}>
    <SimpleForm toolbar={<Toolbar><SaveButton /></Toolbar>}>
      <TextInput source="first_name" validate={maxLength(255)} />
      <TextInput source="last_name" validate={maxLength(255)} />
      <TextInput source="email" type="email" validate={[required(), email(), maxLength(255)]} />
      <ReferenceInput source="global_role_id" reference="roles" perPage={100} sort={{ field: "name", order: "ASC" }}>
        <SelectInput optionText="name" label="Global role" validate={required()} />
      </ReferenceInput>
    </SimpleForm>
  </Edit>;
}
function RolesList() {
  return <AdminList searchPlaceholder="Role name" sort={{ field: "name", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="name" /><BooleanField source="builtin" />
      <BooleanField source="can_manage_all_courses" /><BooleanField source="can_edit_system_configuration" />
    </Datagrid>
  </AdminList>;
}
function RoleShow() {
  return <Show actions={false}><SimpleShowLayout>
    <TextField source="id" /><TextField source="name" /><BooleanField source="builtin" />
    <BooleanField source="can_manage_all_courses" /><BooleanField source="can_edit_system_configuration" />
  </SimpleShowLayout></Show>;
}
function CourseRolesList() {
  return <AdminList searchPlaceholder="Role name" sort={{ field: "name", order: "ASC" }}><Datagrid rowClick="show" bulkActionButtons={false}>
    <TextField source="id" /><TextField source="name" /><BooleanField source="builtin" />
    <BooleanField source="can_manage_course" /><BooleanField source="can_manage_assignments" />
    <BooleanField source="can_grade_submissions" /><BooleanField source="can_view_other_submissions" /><EditButton />
  </Datagrid></AdminList>;
}
function CourseRoleShow() {
  return <Show><SimpleShowLayout><TextField source="id" /><TextField source="name" /><BooleanField source="builtin" />
    <BooleanField source="can_manage_course" /><BooleanField source="can_manage_assignments" />
    <BooleanField source="can_grade_submissions" /><BooleanField source="can_view_other_submissions" />
  </SimpleShowLayout></Show>;
}
function LatePoliciesList() {
  return <AdminList searchPlaceholder="Policy name" sort={{ field: "name", order: "ASC" }}><Datagrid rowClick="show" bulkActionButtons={false}>
    <TextField source="id" /><TextField source="name" /><NumberField source="late_days" /><NumberField source="late_percent" /><EditButton />
  </Datagrid></AdminList>;
}
function LatePolicyShow() {
  return <Show><SimpleShowLayout><TextField source="id" /><TextField source="name" />
    <NumberField source="late_days" /><NumberField source="late_percent" />
  </SimpleShowLayout></Show>;
}
function LmsTypesList() {
  return <AdminList searchPlaceholder="LMS type name" sort={{ field: "name", order: "ASC" }}><Datagrid rowClick="show" bulkActionButtons={false}>
    <TextField source="id" /><TextField source="name" /><EditButton />
  </Datagrid></AdminList>;
}
function LmsTypeShow() { return <Show><SimpleShowLayout><TextField source="id" /><TextField source="name" /></SimpleShowLayout></Show>; }
function LmsInstancesList() {
  return <AdminList searchPlaceholder="Instance URL" sort={{ field: "url", order: "ASC" }}><Datagrid rowClick="show" bulkActionButtons={false}>
    <TextField source="id" /><TextField source="url" /><TextField source="lms_type_id" /><TextField source="organization_id" /><TextField source="client_id" /><EditButton />
  </Datagrid></AdminList>;
}
function LmsInstanceShow() {
  return <Show><SimpleShowLayout><TextField source="id" /><TextField source="url" />
    <TextField source="lms_type_id" /><TextField source="organization_id" />
    <TextField source="consumer_key" /><TextField source="client_id" /><TextField source="issuer" />
    <TextField source="keyset_url" /><TextField source="oauth2_url" /><TextField source="platform_oidc_auth_url" />
    <TextField source="public_key" /><DateField source="created_at" /><DateField source="updated_at" />
  </SimpleShowLayout></Show>;
}
export default function AdminDashboard() {
  // The surrounding RequireAuth and every /api/admin endpoint enforce administrator access.
  return <Admin basename="/admin" dataProvider={dataProvider} layout={AdminLayout} dashboard={AdminHome}
    disableTelemetry theme={{ palette: { mode: "light", primary: { main: "#175c91" },
      background: { default: "#f4f6f8", paper: "#ffffff" }, text: { primary: "#202b36", secondary: "#4b5968" } },
      typography: { fontFamily: "Arial, Helvetica, sans-serif" } }} darkTheme={null} title="OpenDSA Administration">
    <Resource name="organizations" list={OrganizationsList} show={OrganizationShow} create={AdminCreate} edit={AdminEdit} />
    <Resource name="terms" list={TermsList} show={TermShow} create={AdminCreate} edit={AdminEdit} />
    <Resource name="courses" list={CoursesList} show={CourseShow} create={AdminCreate} edit={AdminEdit} />
    <Resource name="course-offerings" options={{ label: "Course Offerings" }} list={OfferingsList} show={OfferingShow} create={AdminCreate} edit={AdminEdit} />
    <Resource name="course-roles" options={{ label: "Course Roles" }} list={CourseRolesList} show={CourseRoleShow} create={AdminCreate} edit={AdminEdit} />
    <Resource name="late-policies" options={{ label: "Late Policies" }} list={LatePoliciesList} show={LatePolicyShow} create={AdminCreate} edit={AdminEdit} />
    <Resource name="lms-types" options={{ label: "LMS Types" }} list={LmsTypesList} show={LmsTypeShow} create={AdminCreate} edit={AdminEdit} />
    <Resource name="lms-instances" options={{ label: "LMS Instances" }} list={LmsInstancesList} show={LmsInstanceShow} create={AdminCreate} edit={AdminEdit} />
    <Resource name="books" options={{ label: "Book Instances" }} list={BooksList} show={BookShow} />
    <Resource name="users" list={UsersList} show={UserShow} edit={UserEdit} />
    <Resource name="roles" options={{ label: "Global Roles" }} list={RolesList} show={RoleShow} />
    {adminFeatures.lmsAccesses && <Resource name="lms-accesses" options={{ label: "LMS Accesses" }}
      list={LmsAccessesList} show={LmsAccessShow} create={LmsAccessCreate} edit={LmsAccessEdit} />}
    {adminFeatures.errors && <Resource name="errors" list={ErrorsList} show={ErrorShow} />}
  </Admin>;
}
