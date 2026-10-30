// Regenerasi satu bagian e-modul dengan AI (pola `question-regenerate`).
//
// 1. Verifikasi kepemilikan bagian + muat konteks draf.
// 2. Cadangkan kredit (`spend_credits`).
// 3. AI menulis ulang isi bagian; simpan lewat `autosave_emodul_section`.
// 4. Gagal di langkah 3 → kredit dikembalikan (`refund_credits`).

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { regenerateEModulSection } from "../_shared/emodul-ai.ts";
import { EMODUL_REGENERATE_COST } from "../_shared/emodul-schema.ts";
import { resolveEbookEntitlement } from "../_shared/entitlement.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface RegenerateRequest {
  section_id?: number | string;
  instruction?: unknown;
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
    const body = await request.json().catch(() => ({})) as RegenerateRequest;
    const sectionId = Number(body.section_id);

    if (!Number.isInteger(sectionId) || sectionId <= 0) {
      return jsonResponse({ message: "section_id tidak valid." }, 422);
    }

    const instruction = typeof body.instruction === "string" ? body.instruction : undefined;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    // Regenerasi bagian termasuk menyusun materi: butuh akses E-Book.
    const entitlement = resolveEbookEntitlement(profile);
    if (!entitlement.entitled) {
      return jsonResponse({
        error: "upgrade_required",
        message: "Regenerasi bagian E-Modul tersedia untuk paket Premium.",
        entitlement,
      }, 402);
    }

    const { data: section, error: sectionError } = await admin
      .from("e_modul_sections")
      .select("id, kind, title, content, chapter_id")
      .eq("id", sectionId)
      .maybeSingle();

    if (sectionError) {
      throw sectionError;
    }
    if (!section) {
      return jsonResponse({ message: "Bagian tidak ditemukan atau bukan milik Anda." }, 404);
    }

    const { data: chapter, error: chapterError } = await admin
      .from("e_modul_chapters")
      .select("id, title, e_modul_id")
      .eq("id", section.chapter_id)
      .maybeSingle();

    if (chapterError) {
      throw chapterError;
    }
    if (!chapter) {
      return jsonResponse({ message: "Bagian tidak ditemukan atau bukan milik Anda." }, 404);
    }

    const { data: session, error: sessionError } = await admin
      .from("e_modul_sessions")
      .select("id, user_id, title, subject, fase, kelas, semester")
      .eq("id", chapter.e_modul_id)
      .maybeSingle();

    if (sessionError) {
      throw sessionError;
    }
    if (!session || Number(session.user_id) !== Number(profile.id)) {
      return jsonResponse({ message: "Bagian tidak ditemukan atau bukan milik Anda." }, 404);
    }

    if (Number(profile.credits_balance) < EMODUL_REGENERATE_COST) {
      return jsonResponse({
        error: "insufficient_credits",
        message: `Kredit tidak cukup. Saldo: ${profile.credits_balance}, dibutuhkan: ${EMODUL_REGENERATE_COST}.`,
        credits_balance: Number(profile.credits_balance),
        credits_required: EMODUL_REGENERATE_COST,
      }, 402);
    }

    const reserveKey = crypto.randomUUID();

    const { data: reservation, error: reserveError } = await admin.rpc("spend_credits", {
      p_profile_id: profile.id,
      p_amount: EMODUL_REGENERATE_COST,
      p_idempotency_key: reserveKey,
      p_description: `Regenerasi bagian e-modul: ${session.title}`,
      p_reference_type: "emodul",
      p_reference_id: String(sectionId),
    });

    if (reserveError) {
      const message = String(reserveError.message ?? "");
      if (message.includes("insufficient_credits")) {
        return jsonResponse({
          error: "insufficient_credits",
          message: "Kredit tidak cukup.",
        }, 402);
      }
      throw reserveError;
    }

    try {
      const content = await regenerateEModulSection({
        id: Number(profile.id),
        subscription_tier: profile.subscription_tier,
        credits_balance: Number(profile.credits_balance),
        subscription_expiry: profile.subscription_expiry,
      }, {
        subject: session.subject,
        fase: session.fase,
        kelas: session.kelas,
        semester: session.semester,
        module_title: session.title,
        chapter_title: chapter.title,
        kind: section.kind === "latihan" ? "latihan" : "materi",
        title: section.title,
        current_content: section.content,
        instruction,
      });

      const { data: saved, error: saveError } = await admin.rpc("autosave_emodul_section", {
        p_user_id: profile.id,
        p_section_id: sectionId,
        p_title: null,
        p_content: content,
      });

      if (saveError || !saved) {
        throw saveError ?? new Error("Gagal menyimpan bagian hasil regenerasi.");
      }

      return jsonResponse({
        message: "Bagian berhasil dibuat ulang.",
        credits_required: EMODUL_REGENERATE_COST,
        credits_remaining: Number(reservation?.credits_balance ?? 0),
        section: saved,
      }, 200);
    } catch (error) {
      // Gagal menghasilkan/menyimpan: kembalikan kredit yang dicadangkan.
      const { error: refundError } = await admin.rpc("refund_credits", {
        p_profile_id: profile.id,
        p_amount: EMODUL_REGENERATE_COST,
        p_idempotency_key: `refund-${reserveKey}`,
        p_description: `Pengembalian kredit: regenerasi bagian e-modul gagal (${session.title}).`,
        p_reference_type: "emodul",
        p_reference_id: String(sectionId),
      });

      if (refundError) {
        console.error("[emodul-regenerate] refund_credits", refundError);
      }

      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Regenerasi bagian gagal.";

    if (message.includes("insufficient_credits")) {
      return jsonResponse({
        error: "insufficient_credits",
        message: "Kredit tidak cukup.",
      }, 402);
    }

    const status = message.includes("API") ? 503 : 422;

    return jsonResponse({
      error: status === 503 ? "ai_provider_failed" : "ai_invalid_output",
      message,
    }, status);
  }
});
