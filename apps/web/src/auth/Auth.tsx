import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

export interface User { id: number; email: string; first_name: string | null; last_name: string | null;
  global_role: { name: string; can_manage_all_courses: boolean; can_edit_system_configuration: boolean } }
const AuthContext = createContext<{ user: User | null; loading: boolean;
  refresh: () => Promise<void>; logout: () => Promise<void> } | null>(null);

// Fetch a fresh CSRF token from the session, including after login rotation.
export async function authFetch(url: string, options: RequestInit = {}) {
  const tokenResponse = await fetch("/api/auth/csrf");
  if (!tokenResponse.ok) throw new Error("Authentication is unavailable.");
  const { csrfToken } = await tokenResponse.json();
  const headers = new Headers(options.headers); headers.set("X-CSRF-Token", csrfToken);
  return fetch(url, { ...options, headers });
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    try { const response = await fetch("/api/auth/me"); setUser(response.ok ? (await response.json()).user : null); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh().catch(() => setUser(null)); }, []);
  async function logout() {
    const response = await authFetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Sign out failed. Please retry.");
    setUser(null);
  }
  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const auth = useContext(AuthContext); if (!auth) throw new Error("AuthProvider is missing"); return auth; }
export function RequireAuth({ children, instructor = false }: { children: ReactNode; instructor?: boolean }) {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (instructor && !user.global_role.can_manage_all_courses && !["Administrator", "Instructor", "Researcher"].includes(user.global_role.name)) {
    return <p role="alert">Instructor access required.</p>;
  }
  return <>{children}</>;
}
