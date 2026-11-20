import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, useGetOne, useNotify, useRefresh, useRecordContext, type RaRecord } from "react-admin";
import { authFetch } from "../auth/Auth";

export function UpdateBookConfigButton() {
  const record = useRecordContext();
  return record ? <Button label="Update Configuration" to={`/admin/books/${record.id}/update-configuration`} /> : null;
}

export default function AdminBookUpload() {
  const { id } = useParams();
  const updating = id !== undefined;
  const validId = !updating || (/^[1-9]\d*$/.test(id) && Number(id) <= 2147483647);
  const { data: book, isPending, error: loadError } = useGetOne<RaRecord>("books", { id: id ?? 0 }, { enabled: updating && validId });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const notify = useNotify();
  const refresh = useRefresh();
  const navigate = useNavigate();
  useEffect(() => { setFile(null); setError(""); }, [id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !file || (updating && !book) || !validId) return;
    inFlight.current = true; setSaving(true); setError("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a JSON configuration smaller than 10 MB.");
      let config: unknown;
      try { config = JSON.parse(await file.text()); }
      catch { throw new Error("The selected file is not valid JSON."); }
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("The configuration must be a JSON object.");
      const body = JSON.stringify({ config });
      if (new Blob([body]).size > 10 * 1024 * 1024) throw new Error("The configuration exceeds the 10 MB request limit.");
      const message = updating
        ? `Update book configuration:\nID: ${id}\nTitle: '${book?.title}'\nUsing file: ${file.name}?`
        : `Upload new book configuration using file: ${file.name}?`;
      if (!window.confirm(message)) return;
      const endpoint = updating ? `/api/inst_books/${id}/import` : "/api/inst_books/import";
      const response = await authFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to import the book configuration. Please retry.");
      notify(updating ? "Book configuration updated successfully." : "Book configuration uploaded successfully.", { type: "success" });
      if (result?.data?.warnings?.trim()) notify(result.data.warnings, { type: "warning", autoHideDuration: null });
      refresh();
      navigate("/admin/books");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to import the book configuration."); }
    finally { inFlight.current = false; setSaving(false); }
  }

  if (!validId) return <p role="alert">Invalid book ID.</p>;
  if (updating && isPending) return <p>Loading book…</p>;
  if (updating && (loadError || !book)) return <p role="alert">Unable to load this book.</p>;
  return <form className="admin-upload-form" onSubmit={submit} aria-busy={saving}>
    <h2>{updating ? `Select an updated configuration file for book: ${book?.title}.` : "Select a configuration file to upload."}</h2>
    {error && <p role="alert">{error}</p>}
    <label htmlFor="book-config-file">Book configuration (JSON) <span aria-hidden="true" className="admin-required">*</span></label>
    <input key={id ?? "new"} id="book-config-file" type="file" accept=".json,application/json" required disabled={saving}
      onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); }} />
    <div className="admin-upload-actions"><button type="submit" disabled={saving || !file}>{saving ? "Importing…" : "Submit File"}</button>
      {!saving && <Link to="/admin/books">Cancel</Link>}</div>
    {saving && <p role="status">Expanding and saving the configuration…</p>}
  </form>;
}
