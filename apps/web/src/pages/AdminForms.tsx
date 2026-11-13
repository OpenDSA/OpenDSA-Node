import {
  Create, Edit, SimpleForm, PasswordInput, TextInput, NumberInput, DateInput, BooleanInput,
  ReferenceInput, AutocompleteInput, SelectInput, Toolbar, SaveButton,
  required, maxLength, useRecordContext, useResourceContext,
} from "react-admin";
import { useAuth } from "../auth/Auth";

const textValidation = [required(), maxLength(255)];
const integer = (value: number) => Number.isInteger(value) ? undefined : "Enter a whole number.";
export const seasons = [{ id: 100, name: "Spring" }, { id: 200, name: "Summer I" },
  { id: 300, name: "Summer II" }, { id: 400, name: "Fall" }, { id: 500, name: "Winter" }];
function RecordInputs() {
  const resource = useResourceContext();
  const record = useRecordContext();
  switch (resource) {
    case "organizations": return <>
      <TextInput source="name" validate={textValidation} /><TextInput source="abbreviation" validate={textValidation} />
    </>;
    case "terms": return <>
      <SelectInput source="season" choices={seasons} validate={required()} />
      <NumberInput source="year" validate={[required(), integer]} />
      <DateInput source="starts_on" validate={required()} /><DateInput source="ends_on" validate={required()} />
    </>;
    case "courses": return <>
      <ReferenceInput source="organization_id" reference="organizations"><AutocompleteInput label="Organization" optionText="name" validate={required()} /></ReferenceInput>
      <ReferenceInput source="user_id" reference="users"><AutocompleteInput label="Owner" optionText="email" validate={required()} /></ReferenceInput>
      <TextInput source="number" validate={textValidation} /><TextInput source="name" validate={textValidation} />
    </>;
    case "course-offerings": return <>
      <ReferenceInput source="lms_instance_id" reference="lms-instances"><AutocompleteInput label="LMS instance" optionText="url" validate={required()} /></ReferenceInput>
      <TextInput source="lms_course_code" label="LMS course label / SIS ID" validate={maxLength(255)} />
      <TextInput source="lms_course_num" label="LMS internal course ID" validate={textValidation} />
      <ReferenceInput source="course_id" reference="courses"><AutocompleteInput label="Course" optionText={r => `${r.number}: ${r.name}`} validate={required()} /></ReferenceInput>
      <ReferenceInput source="term_id" reference="terms"><AutocompleteInput label="Term" optionText="slug" validate={required()} /></ReferenceInput>
      <TextInput source="label" validate={textValidation} /><BooleanInput source="archived" />
    </>;
    case "course-roles": return <>
      <TextInput source="name" validate={textValidation} />
      {record?.builtin && <p>Built-in permissions cannot be changed. The role name can be edited.</p>}
      <BooleanInput source="can_manage_course" disabled={!!record?.builtin} />
      <BooleanInput source="can_manage_assignments" disabled={!!record?.builtin} />
      <BooleanInput source="can_grade_submissions" disabled={!!record?.builtin} />
      <BooleanInput source="can_view_other_submissions" disabled={!!record?.builtin} />
    </>;
    case "late-policies": return <>
      <TextInput source="name" validate={textValidation} />
      <NumberInput source="late_days" validate={[required(), integer]} /><NumberInput source="late_percent" validate={[required(), integer]} />
    </>;
    case "lms-instances": return <>
      <ReferenceInput source="lms_type_id" reference="lms-types"><AutocompleteInput label="LMS type" optionText="name" validate={required()} /></ReferenceInput>
      <TextInput source="url" label="URL" validate={textValidation} />
      <ReferenceInput source="organization_id" reference="organizations"><AutocompleteInput label="Organization" optionText="name" validate={required()} /></ReferenceInput>
      <TextInput source="consumer_key" validate={maxLength(255)} />
      <PasswordInput source="consumer_secret" helperText="Leave blank to keep the existing shared secret." validate={maxLength(255)} />
      <TextInput source="client_id" label="LTI 1.3 client ID" validate={maxLength(255)} />
      <PasswordInput source="private_key" label="Private key (PEM)" multiline minRows={4}
        helperText="Leave blank on edit to keep the existing key. New LTI 1.3 instances generate a 2048-bit RSA keypair if blank." validate={maxLength(16384)} />
      <TextInput source="public_key" label="Public key (PEM)" multiline minRows={4}
        helperText="Leave blank to derive from the private key. When replacing a private key, clear this field to derive its matching public key." validate={maxLength(16384)} />
      <TextInput source="keyset_url" label="Platform keyset URL" validate={maxLength(255)} />
      <TextInput source="oauth2_url" label="OAuth2 token URL" validate={maxLength(255)} />
      <TextInput source="platform_oidc_auth_url" label="OIDC authorization URL" validate={maxLength(255)} />
      <TextInput source="issuer" validate={maxLength(255)} />
    </>;
    case "lms-types": return <TextInput source="name" validate={textValidation} />;
    default: return null;
  }
}
function RecordForm() {
  const { user } = useAuth();
  return <SimpleForm defaultValues={{ user_id: user?.id, archived: false, can_manage_course: false,
    can_manage_assignments: false, can_grade_submissions: false, can_view_other_submissions: false }}
    toolbar={<Toolbar><SaveButton /></Toolbar>}>
    <RecordInputs />
  </SimpleForm>;
}
export function AdminCreate() { return <Create redirect="show"><RecordForm /></Create>; }
export function AdminEdit() { return <Edit mutationMode="pessimistic" redirect="show"><RecordForm /></Edit>; }
