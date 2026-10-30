/**
 * Pemanggil Edge Function bersama.
 *
 * Setiap modul klien (soal, e-modul, proyek) memakai helper ini supaya pesan
 * error dari server selalu diteruskan apa adanya dan kelas error-nya sama
 * (`ApiError`). Tanpa ini, halaman baru perlu menebak bentuk error sendiri.
 */

import { supabase } from "@/lib/supabase";

export class ApiError extends Error {
  response?: {
    status: number;
    data: {
      message?: string;
      error?: string;
      errors?: Record<string, string[]>;
      [key: string]: unknown;
    };
  };

  constructor(message: string, status = 500, data: Record<string, unknown> = {}) {
    super(message);
    this.response = {
      status,
      data: {
        message,
        ...data,
      },
    };
  }
}

/** Melempar ApiError berisi pesan asli dari Edge Function, bukan pesan generik. */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown>,
  });

  if (error) {
    const maybeResponse = (error as { context?: Response }).context;
    if (maybeResponse instanceof Response) {
      const status = maybeResponse.status;
      const payload = await maybeResponse.json().catch(() => ({ message: error.message }));
      throw new ApiError(payload.message ?? error.message, status, payload);
    }

    throw new ApiError(error.message);
  }

  return data as T;
}
