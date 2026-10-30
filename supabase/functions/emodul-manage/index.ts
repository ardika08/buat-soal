// Kelola struktur e-modul: susun ulang, tambah, dan hapus bab/bagian.
//
// POST { action, ... } — action:
//   reorder_chapters { e_modul_id, chapter_ids }
//   reorder_sections { chapter_id, section_ids }
//   add_section      { chapter_id, kind, title?, content? }
//   delete_section   { section_id }
//   add_chapter      { e_modul_id, title? }
//   delete_chapter   { chapter_id }
//
// Sesi dijaga `requireUser`; setiap aksi mengembalikan draf terbaru.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface ManageRequest {
  action?: string;
  e_modul_id?: number | string;
  chapter_id?: number | string;
  section_id?: number | string;
  chapter_ids?: Array<number | string>;
  section_ids?: Array<number | string>;
  kind?: string;
  title?: unknown;
  content?: unknown;
}

function toPositiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toIdArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids = value.map((item) => Number(item));
  return ids.every((id) => Number.isInteger(id) && id > 0) ? ids : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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
    const body = await request.json().catch(() => ({})) as ManageRequest;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    const userId = profile.id;
    let rpc: string;
    let params: Record<string, unknown>;

    switch (body.action) {
      case "reorder_chapters": {
        const eModulId = toPositiveId(body.e_modul_id);
        const chapterIds = toIdArray(body.chapter_ids);

        if (!eModulId || !chapterIds) {
          return jsonResponse({ message: "Data urutan bab tidak valid." }, 422);
        }

        rpc = "reorder_emodul_chapters";
        params = { p_user_id: userId, p_emodul_id: eModulId, p_chapter_ids: chapterIds };
        break;
      }

      case "reorder_sections": {
        const chapterId = toPositiveId(body.chapter_id);
        const sectionIds = toIdArray(body.section_ids);

        if (!chapterId || !sectionIds) {
          return jsonResponse({ message: "Data urutan bagian tidak valid." }, 422);
        }

        rpc = "reorder_emodul_sections";
        params = { p_user_id: userId, p_chapter_id: chapterId, p_section_ids: sectionIds };
        break;
      }

      case "add_section": {
        const chapterId = toPositiveId(body.chapter_id);

        if (!chapterId) {
          return jsonResponse({ message: "chapter_id tidak valid." }, 422);
        }
        if (body.kind !== "materi" && body.kind !== "latihan") {
          return jsonResponse({ message: "Jenis bagian harus 'materi' atau 'latihan'." }, 422);
        }

        rpc = "add_emodul_section";
        params = {
          p_user_id: userId,
          p_chapter_id: chapterId,
          p_kind: body.kind,
          p_title: textValue(body.title),
          p_content: textValue(body.content),
        };
        break;
      }

      case "delete_section": {
        const sectionId = toPositiveId(body.section_id);

        if (!sectionId) {
          return jsonResponse({ message: "section_id tidak valid." }, 422);
        }

        rpc = "delete_emodul_section";
        params = { p_user_id: userId, p_section_id: sectionId };
        break;
      }

      case "add_chapter": {
        const eModulId = toPositiveId(body.e_modul_id);

        if (!eModulId) {
          return jsonResponse({ message: "e_modul_id tidak valid." }, 422);
        }

        rpc = "add_emodul_chapter";
        params = { p_user_id: userId, p_emodul_id: eModulId, p_title: textValue(body.title) };
        break;
      }

      case "delete_chapter": {
        const chapterId = toPositiveId(body.chapter_id);

        if (!chapterId) {
          return jsonResponse({ message: "chapter_id tidak valid." }, 422);
        }

        rpc = "delete_emodul_chapter";
        params = { p_user_id: userId, p_chapter_id: chapterId };
        break;
      }

      default:
        return jsonResponse({ message: "Aksi tidak dikenal." }, 422);
    }

    const { data: draft, error } = await admin.rpc(rpc, params);

    if (error) {
      const message = String(error.message ?? "");

      if (message.includes("invalid_order")) {
        return jsonResponse({ message: "Daftar urutan tidak cocok dengan isi draf." }, 422);
      }
      if (message.includes("last_section")) {
        return jsonResponse({ message: "Minimal satu bagian harus tersisa di bab ini." }, 422);
      }
      if (message.includes("last_chapter")) {
        return jsonResponse({ message: "Minimal satu bab harus tersisa." }, 422);
      }
      if (message.includes("invalid_kind")) {
        return jsonResponse({ message: "Jenis bagian tidak dikenal." }, 422);
      }
      if (message.includes("forbidden") || message.includes("not_found")) {
        return jsonResponse({ message: "Draf/bagian tidak ditemukan atau bukan milik Anda." }, 404);
      }

      throw error;
    }

    return jsonResponse({ message: "Struktur modul diperbarui.", ...draft });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memperbarui struktur modul.",
    }, 500);
  }
});
