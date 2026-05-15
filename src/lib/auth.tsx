import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, type AuthUser } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem("auth_user");
    return stored ? JSON.parse(stored) as AuthUser : null;
  });
  const [isLoading, setIsLoading] = useState(Boolean(localStorage.getItem("auth_token")));

  const persistUser = useCallback((nextUser: AuthUser | null) => {
    setUser(nextUser);

    if (nextUser) {
      localStorage.setItem("auth_user", JSON.stringify(nextUser));
    } else {
      localStorage.removeItem("auth_user");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      persistUser(null);
      return null;
    }

    const res = await authApi.me();
    persistUser(res.data.user);
    return res.data.user;
  }, [persistUser]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      setIsLoading(false);
      return;
    }

    authApi.me()
      .then((res) => {
        persistUser(res.data.user);
      })
      .catch(() => {
        localStorage.removeItem("auth_token");
        persistUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    loginWithGoogle: async (credential: string) => {
      const res = await authApi.google({ credential });
      localStorage.setItem("auth_token", res.data.token);
      persistUser(res.data.user);
    },
    logout: async () => {
      try {
        await authApi.logout();
      } catch {
        // Token may already be expired; local cleanup still matters.
      }

      localStorage.removeItem("auth_token");
      persistUser(null);
    },
    refreshUser,
    updateUser: (patch: Partial<AuthUser>) => {
      setUser((current) => {
        if (!current) {
          return current;
        }

        const nextUser = { ...current, ...patch };
        localStorage.setItem("auth_user", JSON.stringify(nextUser));
        return nextUser;
      });
    },
  }), [user, isLoading, refreshUser, persistUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
