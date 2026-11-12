import {
  Admin, Resource, List, Datagrid, TextField, NumberField, DateField, Show,
  BooleanField, SimpleShowLayout, Menu, Notification, HttpError,
  Edit, SimpleForm, TextInput, ReferenceInput, SelectInput, Toolbar, SaveButton,
  EditButton, required, email, maxLength, useNotify, useRedirect,
  type DataProvider, type LayoutProps,
} from "react-admin";
import { authFetch, useAuth } from "../auth/Auth";

// Explicit resources and fields keep credentials out of the admin interface.
async function read(resource: string, suffix: string) {
  if (!["organizations", "terms", "courses", "course-offerings", "books", "users", "roles"].includes(resource)) throw new Error("Unknown resource.");
  const response = await fetch(`/api/admin/${resource}${suffix}`);
  const body = await response.json();
  if (!response.ok) throw new HttpError(body.error || "Request failed.", response.status, body);
  return body;
}
const unsupported = async (): Promise<never> => { throw new Error("This operation is not supported."); };
const dataProvider: DataProvider = {
  getList: (resource, params) => {
    const query = new URLSearchParams({
      page: String(params.pagination?.page ?? 1), per_page: String(params.pagination?.perPage ?? 25),
      sort: params.sort?.field ?? "id", order: params.sort?.order ?? "ASC",
    });
    return read(resource, `?${query}`);
  },
  getOne: (resource, params) => read(resource, `/${encodeURIComponent(params.id)}`),
  getMany: async (resource, params) => {
    const records = await Promise.all(params.ids.map(id => read(resource, `/${encodeURIComponent(id)}`)));
    return { data: records.map(record => record.data) };
  }, getManyReference: unsupported,
  create: unsupported,
  update: async (resource, params) => {
    if (resource !== "users") return unsupported();
    const { first_name, last_name, email, global_role_id } = params.data;
    const response = await authFetch(`/api/admin/users/${encodeURIComponent(params.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name, last_name, email, global_role_id }),
    });
    const body = await response.json();
    if (!response.ok) throw new HttpError(body.error || "User update failed.", response.status, body);
    return body;
  }, updateMany: unsupported,
  delete: unsupported, deleteMany: unsupported,
};
function AdminLayout({ children }: LayoutProps) {
  return <div style={{ display: "flex", gap: "1rem", minHeight: "60vh" }}>
    <aside aria-label="Admin resources"><Menu /></aside>
    <section style={{ flex: 1, minWidth: 0 }}>{children}</section>
    <Notification />
  </div>;
}
function OrganizationsList() {
  return <List exporter={false} sort={{ field: "name", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="name" /><TextField source="abbreviation" />
      <DateField source="created_at" />
    </Datagrid>
  </List>;
}
function OrganizationShow() {
  return <Show actions={false}><SimpleShowLayout>
    <TextField source="id" /><TextField source="name" /><TextField source="abbreviation" />
    <TextField source="slug" /><DateField source="created_at" />
  </SimpleShowLayout></Show>;
}
function TermsList() {
  return <List exporter={false} sort={{ field: "starts_on", order: "DESC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="slug" sortable={false} label="Term" />
      <TextField source="year" /><DateField source="starts_on" /><DateField source="ends_on" />
    </Datagrid>
  </List>;
}
function TermShow() {
  return <Show actions={false}><SimpleShowLayout>
    <TextField source="id" /><TextField source="slug" label="Term" /><TextField source="season" />
    <TextField source="year" /><DateField source="starts_on" /><DateField source="ends_on" />
  </SimpleShowLayout></Show>;
}
function CoursesList() {
  return <List exporter={false} sort={{ field: "name", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="number" /><TextField source="name" />
      <TextField source="organization.name" label="Organization" sortable={false} />
    </Datagrid>
  </List>;
}
function CourseShow() {
  return <Show actions={false}><SimpleShowLayout>
    <TextField source="id" /><TextField source="number" /><TextField source="name" />
    <TextField source="organization.name" label="Organization" /><TextField source="organization_id" />
    <TextField source="user_id" label="Owner user ID" /><TextField source="slug" />
    <DateField source="created_at" /><DateField source="updated_at" />
  </SimpleShowLayout></Show>;
}
function OfferingsList() {
  return <List exporter={false} sort={{ field: "created_at", order: "DESC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="label" />
      <TextField source="course.number" label="Course number" sortable={false} />
      <TextField source="course.name" label="Course" sortable={false} />
      <TextField source="term.slug" label="Term" sortable={false} />
      <TextField source="lms_course_num" label="LMS course number" /><BooleanField source="archived" />
    </Datagrid>
  </List>;
}
function OfferingShow() {
  return <Show actions={false}><SimpleShowLayout>
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
  return <List exporter={false} sort={{ field: "title", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="title" /><BooleanField source="template" />
      <TextField source="user.email" label="Owner" sortable={false} />
      <TextField source="course_offering.label" label="Offering" sortable={false} />
      <DateField source="last_compiled" showTime emptyText="Not compiled" />
    </Datagrid>
  </List>;
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
  return <List exporter={false} sort={{ field: "email", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="email" /><TextField source="first_name" />
      <TextField source="last_name" /><TextField source="global_role.name" label="Role" sortable={false} />
      <DateField source="created_at" showTime /><DateField source="current_sign_in_at" label="Latest sign-in" showTime />
      <NumberField source="sign_in_count" /><EditButton />
    </Datagrid>
  </List>;
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
  return <List exporter={false} sort={{ field: "name", order: "ASC" }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="name" /><BooleanField source="builtin" />
      <BooleanField source="can_manage_all_courses" /><BooleanField source="can_edit_system_configuration" />
    </Datagrid>
  </List>;
}
function RoleShow() {
  return <Show actions={false}><SimpleShowLayout>
    <TextField source="id" /><TextField source="name" /><BooleanField source="builtin" />
    <BooleanField source="can_manage_all_courses" /><BooleanField source="can_edit_system_configuration" />
  </SimpleShowLayout></Show>;
}
export default function AdminDashboard() {
  // The surrounding RequireAuth and every /api/admin endpoint enforce administrator access.
  return <Admin basename="/admin" dataProvider={dataProvider} layout={AdminLayout}
    disableTelemetry title="OpenDSA Administration">
    <Resource name="organizations" list={OrganizationsList} show={OrganizationShow} />
    <Resource name="terms" list={TermsList} show={TermShow} />
    <Resource name="courses" list={CoursesList} show={CourseShow} />
    <Resource name="course-offerings" options={{ label: "Course Offerings" }} list={OfferingsList} show={OfferingShow} />
    <Resource name="books" list={BooksList} show={BookShow} />
    <Resource name="users" list={UsersList} show={UserShow} edit={UserEdit} />
    <Resource name="roles" options={{ label: "Global Roles" }} list={RolesList} show={RoleShow} />
  </Admin>;
}
