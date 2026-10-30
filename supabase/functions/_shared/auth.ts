/**
 * Penjaga sesi untuk fungsi (rute) modul terproteksi.
 *
 * Memverifikasi JWT pemanggil lewat Supabase Auth. Dipakai bersama supaya setiap
 * fungsi modul menolak permintaan tanpa sesi dengan cara yang sama (401), alih-alih
 * menyalin pemeriksaan yang sama di tiap fungsi.
 */

import { jsonResponse } from "./cors.ts";
import { createUserClient } from "./supabase.ts";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export type AuthGuardResult =
  | { user: AuthenticatedUser }
  | { response: Response };

export async function requireUser(request: Request): Promise<AuthGuardResult> {
  const userClient = createUserClient(request);
  const { data, error } = await userClient.auth.getUser();

  if (error || !data.user) {
    return { response: jsonResponse({ message: "Unauthenticated." }, 401) };
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
  };
}
