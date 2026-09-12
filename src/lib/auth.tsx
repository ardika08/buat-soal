import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, type AuthUser } from "@/lib/api";
import { AuthContext, type AuthContextValue } from "@/lib/auth-context";
import { clearSubscriptionInfoSession, markSubscriptionInfoPending } from "@/lib/session-flags";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem("auth_user");
    return stored ? JSON.parse(stored) as AuthUser : null;
  });
  // Nilai awal sudah mencerminkan ada/tidaknya token, jadi cabang "tanpa token"
  // di effect tidak perlu mematikan loading lagi.
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
  }, [persistUser]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    loginWithGoogle: async (credential: string) => {
      const res = await authApi.google({ credential });
      localStorage.setItem("auth_token", res.data.token);
      markSubscriptionInfoPending();
      persistUser(res.data.user);
    },
    logout: async () => {
      try {
        await authApi.logout();
      } catch {
        // Token may already be expired; local cleanup still matters.
      }

      localStorage.removeItem("auth_token");
      clearSubscriptionInfoSession();
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
