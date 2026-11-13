// Shared notification keeps API failures and the visible login state in sync.
const sessionEvents = new EventTarget();
export function onSessionExpired(listener: () => void) {
  sessionEvents.addEventListener("expired", listener);
  return () => sessionEvents.removeEventListener("expired", listener);
}
export async function apiFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  // Invalid login credentials aren't an expired authenticated request.
  if (response.status === 401 && url !== "/api/auth/login") {
    sessionEvents.dispatchEvent(new Event("expired"));
  }
  return response;
}
// An expired login already satisfies logout; other failures must remain visible.
export function logoutSucceeded(response: Response) {
  return response.ok || response.status === 401;
}
