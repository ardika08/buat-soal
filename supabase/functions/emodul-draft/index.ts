// Simpan & ambil draf e-modul untuk editor.
//
// POST { action: "get", e_modul_id }                    → sesi + bab + bagian.
// POST { action: "save", e_modul_id, e_modul, chapters } → perbarui draf.
//
// Sesi dijaga `requireUser`. Penambahan/penghapusan/penyusunan ulang bagian
// ditangani endpoint tersendiri; di sini hanya perubahan isi draf yang ada.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface DraftRequest {
  action?: "get" | "save";
  e_modul_id?: number | string;
  e_modul?: Record<string, unknown>;
  chapters?: unknown[];
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    const admin = createAdminClient();
    const body = await request.json().catch(() => ({})) as DraftRequest;
    const eModulId = Number(body.e_modul_id);

    if (!Number.isInteger(eModulId) || eModulId <= 0) {
      return jsonResponse({ message: "e_modul_id tidak valid." }, 422);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    const action = body.action ?? "get";

    if (action === "save") {
      const { data: saved, error: saveError } = await admin.rpc("save_emodul_draft", {
        p_user_id: profile.id,
        p_emodul_id: eModulId,
        p_emodul: body.e_modul ?? {},
        p_chapters: body.chapters ?? [],
      });

      if (saveError) {
        const message = String(saveError.message ?? "");

        if (message.includes("forbidden")) {
          return jsonResponse({ message: "Draf e-modul tidak ditemukan atau bukan milik Anda." }, 404);
        }

        throw saveError;
      }

      return jsonResponse({ message: "Draf tersimpan.", ...saved });
    }

    if (action !== "get") {
      return jsonResponse({ message: "Aksi tidak dikenal. Gunakan 'get' atau 'save'." }, 422);
    }

    // Ambil draf: sesi (sekalian cek kepemilikan), lalu bab dan bagiannya.
    const { data: session, error: sessionError } = await admin
      .from("e_modul_sessions")
      .select("*")
      .eq("id", eModulId)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      return jsonResponse({ message: "Draf e-modul tidak ditemukan." }, 404);
    }

    const { data: chapterRows, error: chapterError } = await admin
      .from("e_modul_chapters")
      .select("id, order_number, title")
      .eq("e_modul_id", eModulId)
      .order("order_number", { ascending: true });

    if (chapterError) {
      throw chapterError;
    }

    const chapterIds = (chapterRows ?? []).map((chapter: { id: number }) => chapter.id);
    let sectionRows: Array<{
      id: number;
      chapter_id: number;
      order_number: number;
      kind: string;
      title: string;
      content: string;
    }> = [];

    if (chapterIds.length > 0) {
      const { data: sections, error: sectionError } = await admin
        .from("e_modul_sections")
        .select("id, chapter_id, order_number, kind, title, content")
        .in("chapter_id", chapterIds)
        .order("order_number", { ascending: true });

      if (sectionError) {
        throw sectionError;
      }

      sectionRows = sections ?? [];
    }

    const chapters = (chapterRows ?? []).map((chapter: { id: number }) => ({
      ...chapter,
      sections: sectionRows.filter(
        (section) => Number(section.chapter_id) === Number(chapter.id),
      ),
    }));

    return jsonResponse({ e_modul: session, chapters });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memproses draf e-modul.",
    }, 500);
  }
});
