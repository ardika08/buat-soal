// Generate e-modul (pola exam-generate) dengan pengamanan kredit:
// 1. Cadangkan kredit lebih dulu (`spend_credits`) agar pemakaian AI tidak gratis.
// 2. AI menyusun struktur; kelengkapannya divalidasi (jumlah bab/bagian/latihan).
// 3. Simpan sesi + bab + bagian (`save_emodul`, tanpa menyentuh saldo).
// 4. Bila langkah 2-3 gagal, kredit dikembalikan (`refund_credits`).

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { generateEModul } from "../_shared/emodul-ai.ts";
import {
  emodulCreditCost,
  validateGeneratePayload,
  type GenerateEModulPayload,
} from "../_shared/emodul-schema.ts";
import { resolveEbookEntitlement } from "../_shared/entitlement.ts";
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
    const payload = await request.json() as GenerateEModulPayload;

    const validation = validateGeneratePayload(payload);
    if (validation) {
      return jsonResponse({ message: validation }, 422);
    }

    const requiredCredits = emodulCreditCost(payload);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    // E-Book dibundel ke langganan: menyusun modul butuh akses Premium.
    const entitlement = resolveEbookEntitlement(profile);
    if (!entitlement.entitled) {
      return jsonResponse({
        error: "upgrade_required",
        message: "Generator E-Modul tersedia untuk paket Premium.",
        entitlement,
      }, 402);
    }

    if (Number(profile.credits_balance) < requiredCredits) {
      return jsonResponse({
        error: "insufficient_credits",
        message: `Kredit tidak cukup. Saldo: ${profile.credits_balance}, dibutuhkan: ${requiredCredits}.`,
        credits_balance: Number(profile.credits_balance),
        credits_required: requiredCredits,
      }, 402);
    }

    const description = `Generate e-modul: ${payload.subject} — ${payload.chapters} bab x ${payload.sub_chapters} subbab`;
    const reserveKey = crypto.randomUUID();

    const { data: reservation, error: reserveError } = await admin.rpc("spend_credits", {
      p_profile_id: profile.id,
      p_amount: requiredCredits,
      p_idempotency_key: reserveKey,
      p_description: description,
      p_reference_type: "emodul",
      p_reference_id: null,
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
      const generated = await generateEModul({
        id: Number(profile.id),
        subscription_tier: profile.subscription_tier,
        credits_balance: Number(profile.credits_balance),
        subscription_expiry: profile.subscription_expiry,
      }, payload);

      const { data: saved, error: saveError } = await admin.rpc("save_emodul", {
        p_user_id: profile.id,
        p_emodul: {
          title: generated.title,
          topics: payload.topics,
          fase: payload.fase,
          kelas: payload.kelas,
          subject: payload.subject,
          semester: payload.semester,
          chapters_target: payload.chapters,
          sub_chapters_target: payload.sub_chapters,
          exercise_share: payload.exercise_share,
          status: "draft",
        },
        p_chapters: generated.chapters,
        p_credits_consumed: requiredCredits,
      });

      if (saveError || !saved) {
        throw saveError ?? new Error("Gagal menyimpan e-modul.");
      }

      return jsonResponse({
        message: "E-modul berhasil dibuat.",
        credits_required: requiredCredits,
        credits_remaining: Number(reservation?.credits_balance ?? 0),
        e_modul: {
          ...saved.e_modul,
          chapters: saved.chapters,
        },
      }, 201);
    } catch (error) {
      // Output tidak lengkap / gagal menyimpan: kembalikan kredit yang dicadangkan.
      const { error: refundError } = await admin.rpc("refund_credits", {
        p_profile_id: profile.id,
        p_amount: requiredCredits,
        p_idempotency_key: `refund-${reserveKey}`,
        p_description: `Pengembalian kredit: generate e-modul gagal (${payload.subject}).`,
        p_reference_type: "emodul",
        p_reference_id: null,
      });

      if (refundError) {
        console.error("[emodul-generate] refund_credits", refundError);
      }

      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generate e-modul gagal.";

    if (message.includes("insufficient_credits")) {
      return jsonResponse({
        error: "insufficient_credits",
        message: "Kredit tidak cukup.",
      }, 402);
    }

    const providerFailure = /API|GEMINI_API_KEY|OPENAI_API_KEY|fetch failed|timed out|network/i.test(message);
    const status = providerFailure ? 503 : 422;

    if (!providerFailure) {
      console.error("[emodul-generate] Output AI tidak sesuai kontrak:", message);
    }

    return jsonResponse({
      error: providerFailure ? "ai_provider_failed" : "ai_invalid_output",
      message: providerFailure ? "Layanan AI sedang bermasalah. Coba lagi beberapa saat." : message,
    }, status);
  }
});
