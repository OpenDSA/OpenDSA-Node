import {
  Show, Edit, Create, SimpleShowLayout, SimpleForm, Datagrid, TextField, DateField, FunctionField, WrapperField,
  ReferenceInput, SelectInput, AutocompleteInput, TextInput, PasswordInput, Toolbar, SaveButton, Button,
  TopToolbar, ListButton, ShowButton, EditButton, DeleteWithConfirmButton,
  required, maxLength, useNotify, useRedirect, useRecordContext, type RaRecord,
} from "react-admin";
import { Link } from "react-router-dom";
import { AdminList } from "./AdminListTools";
import { adminFeatures } from "./adminFeatures";

// Expected record shape: the API never returns
// plaintext access tokens or consumer secrets, only a short hint and a presence flag;
// the data provider also strips `access_token`/`consumer_secret` if a response contains them.
type Person = { id: number; first_name: string | null; last_name: string | null; email: string };
const personName = (user: Person) => [user.first_name, user.last_name].filter(Boolean).join(" ");
const personLabel = (user: Person) => personName(user) ? `${personName(user)} - ${user.email}` : user.email;

// Shows at most the last four characters a hint contains, so an over-long hint is never shown in full.
function MaskedCredential({ hint, present }: { hint: string; present: string; label?: string }) {
  const record = useRecordContext();
  if (!record) return null;
  if (!(hint in record) && !(present in record)) return <span className="admin-muted">Not available</span>;
  const tail = typeof record[hint] === "string" ? record[hint].replace(/[^A-Za-z0-9_-]/g, "").slice(-4) : "";
  if (!tail && record[present] !== true) return <span className="admin-muted">Not set</span>;
  return <span className="admin-masked" aria-label={tail ? `Hidden; ends in ${tail}` : "Hidden"}>••••••••{tail}</span>;
}

function LmsAccessDeleteButton({ redirect }: { redirect: "list" | false }) {
  const record = useRecordContext();
  if (!record || !adminFeatures.lmsAccessDelete) return null;
  const user = record.user ? personLabel(record.user) : `user #${record.user_id}`;
  const instance = record.lms_instance?.url ?? `LMS instance #${record.lms_instance_id}`;
  return <DeleteWithConfirmButton mutationMode="pessimistic" redirect={redirect}
    confirmTitle={`Delete LMS access #${record.id}?`}
    confirmContent={<>
      <p>This deletes the LMS access for <strong>{user}</strong> on <strong>{instance}</strong>.</p>
      <p>Its stored access token and consumer credentials are removed. Course generation and LTI launches that
        rely on them will stop working for this user until new credentials are added. This cannot be undone.</p>
    </>} />;
}

const instanceLink = (record: RaRecord) => record.lms_instance
  ? <Link to={`/admin/lms-instances/${record.lms_instance_id}/show`}>{record.lms_instance.url}</Link>
  : `LMS instance #${record.lms_instance_id}`;
const userLink = (record: RaRecord) => record.user
  ? <Link to={`/admin/users/${record.user_id}/show`}>{personLabel(record.user)}</Link>
  : `User #${record.user_id}`;

export function LmsAccessesList() {
  return <AdminList sort={{ field: "id", order: "ASC" }} filters={[
    { source: "email", label: "Email", placeholder: "User email" },
    { source: "lms_instance_id", label: "LMS instance", type: "select", reference: "lms-instances",
      referenceSort: "url", optionText: record => String(record.url) },
    { source: "q", label: "Search", placeholder: "Name, email, or instance URL" },
  ]}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <FunctionField label="LMS Instance" render={instanceLink} />
      <TextField source="user.first_name" label="First Name" sortable={false} emptyText="—" />
      <TextField source="user.last_name" label="Last Name" sortable={false} emptyText="—" />
      <TextField source="user.email" label="Email" sortable={false} />
      <MaskedCredential label="Access Token" hint="access_token_hint" present="has_access_token" />
      <TextField source="consumer_key" label="Consumer Key" sortable={false} emptyText="—" />
      <WrapperField label="Actions">
        <span className="admin-row-actions"><ShowButton /><EditButton /><LmsAccessDeleteButton redirect={false} /></span>
      </WrapperField>
    </Datagrid>
  </AdminList>;
}

export function LmsAccessShow() {
  return <Show actions={<TopToolbar>
    <ListButton label="Back to LMS Accesses" />
    <EditButton label="Edit LMS Access" />
    <LmsAccessDeleteButton redirect="list" />
  </TopToolbar>}>
    <SimpleShowLayout>
      <MaskedCredential label="Access Token" hint="access_token_hint" present="has_access_token" />
      <DateField source="created_at" label="Created At" showTime />
      <DateField source="updated_at" label="Updated At" showTime />
      <FunctionField label="LMS Instance" render={instanceLink} />
      <FunctionField label="User" render={userLink} />
      <TextField source="consumer_key" label="Consumer Key" emptyText="Not set" />
      <MaskedCredential label="Consumer Secret" hint="consumer_secret_hint" present="has_consumer_secret" />
    </SimpleShowLayout>
  </Show>;
}

const noWhitespace = (value: unknown) => typeof value === "string" && /\s/.test(value) ? "Must not contain spaces." : undefined;
function LmsAccessForm({ editing }: { editing: boolean }) {
  const record = useRecordContext();
  const keep = editing ? "Leave blank to keep the current value." : undefined;
  return <SimpleForm toolbar={<Toolbar>
    <SaveButton label={editing ? "Update LMS Access" : "Create LMS Access"} />
    <Button label="Cancel" to={editing && record ? `/admin/lms-accesses/${record.id}/show` : "/admin/lms-accesses"} />
  </Toolbar>}>
    <ReferenceInput source="lms_instance_id" reference="lms-instances" sort={{ field: "url", order: "ASC" }} perPage={100}>
      <SelectInput label="LMS instance" optionText="url" validate={required()} />
    </ReferenceInput>
    <ReferenceInput source="user_id" reference="users" sort={{ field: "email", order: "ASC" }}>
      <AutocompleteInput label="User" optionText={personLabel} validate={required()} />
    </ReferenceInput>
    <PasswordInput source="access_token" label="Access token" autoComplete="off"
      helperText={keep ?? "The Canvas API token for this user."} validate={[maxLength(255), noWhitespace]} />
    <TextInput source="consumer_key" label="Consumer key" autoComplete="off" validate={[maxLength(255), noWhitespace]} />
    <PasswordInput source="consumer_secret" label="Consumer secret" autoComplete="off"
      helperText={keep} validate={[maxLength(255), noWhitespace]} />
  </SimpleForm>;
}

export function LmsAccessEdit() {
  const notify = useNotify(); const redirect = useRedirect();
  return <Edit mutationMode="pessimistic" mutationOptions={{ onSuccess: (data: RaRecord) => {
    notify("LMS access updated.", { type: "success" }); redirect("show", "lms-accesses", data.id);
  } }}><LmsAccessForm editing /></Edit>;
}

export function LmsAccessCreate() {
  const notify = useNotify(); const redirect = useRedirect();
  return <Create mutationOptions={{ onSuccess: (data: RaRecord) => {
    notify("LMS access created.", { type: "success" }); redirect("show", "lms-accesses", data.id);
  } }}><LmsAccessForm editing={false} /></Create>;
}
