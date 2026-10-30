// Detail modul untuk editor.
//
// POST { e_modul_id } → draf lengkap (sesi + bab + bagian) plus ringkasan jumlah
// bab/subbab/latihan. Sesi dijaga `requireUser`; kepemilikan diverifikasi lewat
// user_id pada sesi.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { summarizeEModul, type SummarizableChapter } from "../_shared/emodul-summary.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface DetailRequest {
  e_modul_id?: number | string;
}

interface SectionRow {
  id: number;
  chapter_id: number;
  order_number: number;
  kind: string;
  title: string;
  content: string;
}

interface ChapterRow {
  id: number;
  order_number: number;
  title: string;
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
    const body = await request.json().catch(() => ({})) as DetailRequest;
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
      return jsonResponse({ message: "Modul e-modul tidak ditemukan." }, 404);
    }

    const { data: chapterRows, error: chapterError } = await admin
      .from("e_modul_chapters")
      .select("id, order_number, title")
      .eq("e_modul_id", eModulId)
      .order("order_number", { ascending: true });

    if (chapterError) {
      throw chapterError;
    }

    const chapterIds = (chapterRows ?? []).map((chapter: ChapterRow) => chapter.id);
    let sectionRows: SectionRow[] = [];

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

    const chapters = (chapterRows ?? []).map((chapter: ChapterRow) => ({
      id: Number(chapter.id),
      order_number: Number(chapter.order_number),
      title: chapter.title,
      sections: sectionRows
        .filter((section) => Number(section.chapter_id) === Number(chapter.id))
        .map((section) => ({
          id: Number(section.id),
          order_number: Number(section.order_number),
          kind: section.kind === "latihan" ? "latihan" : "materi",
          title: section.title,
          content: section.content,
        })),
    }));

    const summary = summarizeEModul(chapters as SummarizableChapter[]);

    return jsonResponse({
      e_modul: session,
      chapters,
      summary,
    });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memuat detail modul.",
    }, 500);
  }
});
