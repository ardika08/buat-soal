import { createContext, useContext } from "react";
import type { AuthUser } from "@/lib/api";

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  updateUser: (patch: Partial<AuthUser>) => void;
}

// Konteks dan hook dipisah dari provider-nya supaya file provider hanya
// mengekspor komponen — syarat agar Fast Refresh tidak kehilangan state.
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
