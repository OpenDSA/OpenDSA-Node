import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, onSessionExpired, logoutSucceeded } from "./api";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

export interface User { id: number; email: string; first_name: string | null; last_name: string | null;
  global_role: { name: string; can_manage_all_courses: boolean; can_edit_system_configuration: boolean } }
export function canAccessAdmin(user: User | null) {
  return !!user && (user.global_role.name === "Administrator" || user.global_role.can_edit_system_configuration);
}
const AuthContext = createContext<{ user: User | null; loading: boolean;
  refresh: () => Promise<void>; logout: () => Promise<void> } | null>(null);

// Fetch a fresh CSRF token from the session, including after login rotation.
export async function authFetch(url: string, options: RequestInit = {}) {
  const tokenResponse = await apiFetch("/api/auth/csrf");
  if (!tokenResponse.ok) throw new Error("Authentication is unavailable.");
  const { csrfToken } = await tokenResponse.json();
  const headers = new Headers(options.headers); headers.set("X-CSRF-Token", csrfToken);
  return apiFetch(url, { ...options, headers });
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const clearUser = useCallback(() => { revision.current++; setUser(null); }, []);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401 && request === revision.current) clearUser();
        return;
      }
      const body = await response.json();
      if (request === revision.current) setUser(body.user);
    } finally { setLoading(false); }
  }, [clearUser]);
  useEffect(() => {
    const unsubscribe = onSessionExpired(clearUser);
    const recheck = () => { if (document.visibilityState === "visible") refresh().catch(() => {}); };
    refresh().catch(() => {});
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      unsubscribe(); revision.current++;
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [refresh, clearUser]);
  async function logout() {
    const response = await authFetch("/api/auth/logout", { method: "POST" });
    if (!logoutSucceeded(response)) throw new Error("Sign out failed. Please retry.");
    clearUser();
  }
  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const auth = useContext(AuthContext); if (!auth) throw new Error("AuthProvider is missing"); return auth; }
export function RequireAuth({ children, instructor = false, administrator = false }: { children: ReactNode; instructor?: boolean; administrator?: boolean }) {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (administrator && !canAccessAdmin(user)) return <p role="alert">Administrator access required.</p>;
  if (instructor && !user.global_role.can_manage_all_courses && !["Administrator", "Instructor", "Researcher"].includes(user.global_role.name)) {
    return <p role="alert">Instructor access required.</p>;
  }
  return <>{children}</>;
}
