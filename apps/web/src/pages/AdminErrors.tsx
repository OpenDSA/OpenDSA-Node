import { Show, Datagrid, TextField, DateField, FunctionField, ShowButton, TopToolbar, ListButton, useRecordContext, type RaRecord } from "react-admin";
import type { ReactNode } from "react";
import { AdminList } from "./AdminListTools";

// Record shape mirrors the Prisma `Errors` model. The `params` column is deliberately
// never displayed: legacy rows may hold submitted form values (including credentials).
const clip = (value: unknown, length = 160) => {
  const text = typeof value === "string" ? value : "";
  return text.length > length ? `${text.slice(0, length)}…` : text;
};
export const formatTime = (value: string) => new Date(value).toLocaleString();
const dateRange = (values: Record<string, string>) =>
  values.created_from && values.created_to && values.created_from > values.created_to
    ? "The start date must be on or before the end date." : undefined;

export function ErrorsList() {
  return <AdminList sort={{ field: "created_at", order: "DESC" }} validateFilters={dateRange} filters={[
    { source: "class_name", label: "Class name", placeholder: "e.g. book_config_parse_fail" },
    { source: "message", label: "Message" },
    { source: "created_from", label: "From", type: "date" },
    { source: "created_to", label: "To", type: "date" },
  ]}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="class_name" label="Class Name" emptyText="—" />
      <FunctionField label="Message" render={(record: RaRecord) => <span title={record.message ?? ""}>{clip(record.message) || "—"}</span>} />
      <FunctionField label="URL" render={(record: RaRecord) => clip(record.target_url, 80) || "—"} />
      <DateField source="created_at" label="Time" showTime emptyText="—" />
      <ShowButton />
    </Datagrid>
  </AdminList>;
}

// Shows only the fields the backend actually returned for this error.
function ErrorDetails() {
  const record = useRecordContext();
  if (!record) return null;
  const present = (key: string) => record[key] !== null && record[key] !== undefined && record[key] !== "";
  const rows: [string, string, (value: string) => ReactNode][] = [
    ["Error type", "class_name", value => value],
    ["Message", "message", value => <span className="admin-preformatted">{value}</span>],
    ["Time", "created_at", formatTime],
    ["Request URL", "target_url", value => <span className="admin-break">{value}</span>],
    ["Referrer URL", "referer_url", value => <span className="admin-break">{value}</span>],
    ["User agent", "user_agent", value => value],
    ["Related record", "usable_type", value => `${value}${present("usable_id") ? ` #${record.usable_id}` : ""}`],
    ["Stack trace", "trace", value => <pre className="admin-trace">{value}</pre>],
  ];
  const shown = rows.filter(([, key]) => present(key));
  if (!shown.length) return <p className="admin-muted">No details were recorded for this error.</p>;
  return <dl className="admin-details">
    {shown.map(([label, key, render]) => <div key={key}><dt>{label}</dt><dd>{render(String(record[key]))}</dd></div>)}
  </dl>;
}

export function ErrorShow() {
  return <Show actions={<TopToolbar><ListButton label="Back to Errors" /></TopToolbar>}><ErrorDetails /></Show>;
}
