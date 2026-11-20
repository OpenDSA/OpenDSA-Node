import { Datagrid, TextField, DateField, Show, SimpleShowLayout, TopToolbar, ListButton,
  ShowButton, EditButton, DeleteWithConfirmButton, WrapperField, useRecordContext } from "react-admin";
import { AdminList } from "./AdminListTools";

function DeleteTool({ redirect }: { redirect: "list" | false }) {
  const record = useRecordContext();
  return <DeleteWithConfirmButton mutationMode="pessimistic" redirect={redirect}
    confirmTitle={`Delete learning tool ${record?.name ?? ""}?`}
    confirmContent="This removes the tool configuration and its credentials. Existing content that uses this tool may stop working. This cannot be undone." />;
}
export function LearningToolsList() {
  return <AdminList sort={{ field: "created_at", order: "ASC" }} searchPlaceholder="Name, key, or launch URL">
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="id" /><TextField source="name" /><TextField source="key" />
      <TextField source="secret" sortable={false} /><TextField source="launch_url" label="Launch URL" />
      <WrapperField label="Actions"><span className="admin-row-actions"><ShowButton /><EditButton /><DeleteTool redirect={false} /></span></WrapperField>
    </Datagrid>
  </AdminList>;
}
export function LearningToolShow() {
  return <Show actions={<TopToolbar><ListButton /><EditButton /><DeleteTool redirect="list" /></TopToolbar>}>
    <SimpleShowLayout><TextField source="id" /><TextField source="name" /><TextField source="key" />
      <TextField source="secret" /><TextField source="launch_url" label="Launch URL" />
      <DateField source="created_at" showTime /><DateField source="updated_at" showTime />
    </SimpleShowLayout>
  </Show>;
}
