import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, useRecordContext, useNotify, useRefresh } from "react-admin";
import { authFetch } from "../auth/Auth";

export function CloneBookButton() {
  const record = useRecordContext();
  const [cloning, setCloning] = useState(false);
  const inFlight = useRef(false);
  const notify = useNotify();
  const refresh = useRefresh();
  const navigate = useNavigate();
  if (!record) return null;
  async function clone(event: React.MouseEvent) {
    event.preventDefault(); event.stopPropagation();
    if (inFlight.current || !record) return;
    inFlight.current = true; setCloning(true);
    try {
      const response = await authFetch(`/api/admin/books/${record.id}/clone`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Unable to clone this book.");
      notify(`Book #${record.id} cloned successfully. New book: #${body.data.id}.`, { type: "success" });
      refresh(); navigate("/admin/books");
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to clone this book.", { type: "error" }); }
    finally { inFlight.current = false; setCloning(false); }
  }
  return <Button label={cloning ? "Cloning…" : "Clone"} disabled={cloning} onClick={clone} />;
}
