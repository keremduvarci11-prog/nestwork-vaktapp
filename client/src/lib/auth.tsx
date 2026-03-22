import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiRequest } from "./queryClient";
import { queryClient } from "./queryClient";
import { getAuthToken, setAuthToken, clearAuthToken } from "./token";

type User = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  kontonummer: string | null;
  role: string;
  region: string;
  stilling: string;
  timelonn: string;
  profileImage: string | null;
  cvFile: string | null;
  politiattestFile: string | null;
  available: boolean | null;
  externalId: number | null;
};

type AuthContextType = {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const headers: Record<string, string> = {};
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    fetch("/api/auth/me", { credentials: "include", headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { username, password });
    const u = await res.json();
    if (u.token) {
      setAuthToken(u.token);
    }
    setUser(u);
    queryClient.clear();
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("POST", "/api/auth/logout");
    clearAuthToken();
    setUser(null);
    queryClient.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
