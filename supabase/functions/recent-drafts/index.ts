// Draf terakhir untuk beranda workspace: sesi ujian terakhir guru dan (kelak)
// sesi e-modul terakhir. Sesi e-modul belum punya tabel, jadi untuk siklus ini
// `e_modul_draft` selalu `null` — frontend memakai data tiruan sampai modulnya ada.
//
// Sesi dijaga `requireUser`; data diambil lewat admin client.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { buildRecentDrafts } from "../_shared/drafts.ts";
import { createAdminClient } from "../_shared/supabase.ts";

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

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    const { data: exam, error: examError } = await admin
      .from("exam_sessions")
      .select("id, subject, class_phase, exam_type, created_at, questions(count)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (examError) {
      throw examError;
    }

    const questionsCount = Array.isArray(exam?.questions)
      ? Number((exam.questions[0] as { count?: unknown } | undefined)?.count ?? 0)
      : 0;

    return jsonResponse(buildRecentDrafts({ exam, questionsCount }));
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memuat draf terakhir.",
    }, 500);
  }
});
