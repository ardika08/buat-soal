import { attachIllustrationImages, generateQuestions, totalQuestions, type GenerateExamPayload } from "../_shared/ai.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

type ExamPayload = GenerateExamPayload & { idempotency_key?: string };

/**
 * Membuat sesi ujian + soal + pemotongan kredit.
 *
 * Perubahan P0: penyimpanan & pemotongan kredit kini SATU transaksi lewat
 * `create_exam_with_credits` (SELECT ... FOR UPDATE + ledger idempoten), menggantikan
 * pola lama (insert soal -> update saldo -> insert ledger) yang bisa membuat saldo
 * tidak sinkron dengan riwayat dan rentan double-spend saat request paralel.
 *
 * Pemeriksaan saldo di awal hanya optimasi (gagal cepat sebelum biaya AI dikeluarkan);
 * gerbang sebenarnya ada di dalam RPC.
 */
Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  try {
    const userClient = createUserClient(request);
    const admin = createAdminClient();
    const { data: auth, error: authError } = await userClient.auth.getUser();

    if (authError || !auth.user) {
      return jsonResponse({ message: "Unauthenticated." }, 401);
    }

    const payload = await request.json() as ExamPayload;
    const validation = validatePayload(payload);
    if (validation) {
      return jsonResponse({ message: validation }, 422);
    }

    const requiredCredits = totalQuestions(payload.formats);
    if (requiredCredits > 100) {
      return jsonResponse({ message: "Jumlah soal maksimal adalah 100." }, 422);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    if (Number(profile.credits_balance) < requiredCredits) {
      return insufficientCredits(Number(profile.credits_balance), requiredCredits);
    }

    // Idempotency key dikirim klien supaya retry request yang sama tidak memotong
    // kredit dua kali. Bila tidak ada, generate satu (tetap aman, hanya tanpa dedupe lintas-retry).
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotency_key);

    const generatedQuestions = await generateQuestions({
      id: Number(profile.id),
      subscription_tier: profile.subscription_tier,
      credits_balance: Number(profile.credits_balance),
      subscription_expiry: profile.subscription_expiry,
    }, payload);

    const questionsWithImages = await attachIllustrationImages(generatedQuestions, payload, async (path, bytes) => {
      const { error } = await admin.storage
        .from("question-illustrations")
        .upload(path, bytes, {
          contentType: "image/png",
          upsert: false,
        });

      if (error) {
        return null;
      }

      const { data } = admin.storage.from("question-illustrations").getPublicUrl(path);
      return data.publicUrl;
    });

    const { data: result, error: rpcError } = await admin.rpc("create_exam_with_credits", {
      p_profile_id: Number(profile.id),
      p_exam: {
        curriculum: payload.curriculum,
        exam_type: payload.exam_type,
        class_phase: payload.class_phase,
        subject: payload.subject,
        semester: payload.semester,
        time_allocation: Number(payload.time_allocation),
        reference_type: payload.reference_type,
        difficulty: payload.difficulty,
        cognitive_levels: payload.cognitive_levels,
        pg_options: payload.pg_options,
        include_illustration: Boolean(payload.include_illustration),
        topics: payload.topics,
      },
      p_questions: questionsWithImages.map((question, index) => ({
        order_number: index + 1,
        question_type: question.question_type,
        cognitive_level: question.cognitive_level,
        difficulty: question.difficulty,
        question_content: question.question_content,
        options: question.options,
        correct_answer: question.correct_answer,
        illustration_prompt: question.illustration_prompt ?? null,
        illustration_image: question.illustration_image ?? null,
      })),
      p_idempotency_key: idempotencyKey,
    });

    if (rpcError) {
      if (isInsufficientCreditsError(rpcError)) {
        const balance = Number(profile.credits_balance);
        return insufficientCredits(balance, requiredCredits);
      }

      throw new Error(rpcError.message);
    }

    const exam = result?.exam ?? null;
    const questions = Array.isArray(result?.questions) ? result.questions : [];
    const creditsRemaining = Number(result?.credits_balance ?? profile.credits_balance);

    return jsonResponse({
      message: `Berhasil membuat ${requiredCredits} soal!`,
      exam,
      questions,
      credits_remaining: creditsRemaining,
      idempotent_replay: result?.applied === false,
    }, result?.applied === false ? 200 : 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generate soal gagal.";
    if (message.includes("insufficient_credits")) {
      return jsonResponse({
        error: "insufficient_credits",
        message: "Kredit tidak cukup untuk membuat soal.",
      }, 402);
    }

    const status = message.includes("API") ? 503 : 422;
    return jsonResponse({
      error: status === 503 ? "ai_provider_failed" : "ai_invalid_output",
      message,
    }, status);
  }
});

function insufficientCredits(balance: number, required: number) {
  return jsonResponse({
    error: "insufficient_credits",
    message: `Kredit tidak cukup. Saldo: ${balance}, dibutuhkan: ${required}.`,
    credits_balance: balance,
    credits_required: required,
  }, 402);
}

function normalizeIdempotencyKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (key.length >= 8 && key.length <= 200) {
    return key;
  }

  return `exam:${crypto.randomUUID()}`;
}

/** Postgres mengangkat `insufficient_credits` dengan errcode P0001 dari dalam RPC. */
function isInsufficientCreditsError(error: { code?: string; message?: string; details?: string }) {
  const haystack = `${error.message ?? ""} ${error.details ?? ""}`;
  return error.code === "P0001" && haystack.includes("insufficient_credits")
    || haystack.includes("insufficient_credits");
}

function validatePayload(payload: ExamPayload) {
  const requiredFields: Array<keyof GenerateExamPayload> = [
    "curriculum",
    "exam_type",
    "class_phase",
    "subject",
    "semester",
    "reference_type",
    "difficulty",
  ];

  for (const field of requiredFields) {
    if (typeof payload[field] !== "string" || String(payload[field]).trim() === "") {
      return `Field ${field} wajib diisi.`;
    }
  }

  if (!Number.isFinite(Number(payload.time_allocation))) {
    return "Alokasi waktu wajib berupa angka.";
  }

  if (!Array.isArray(payload.cognitive_levels) || payload.cognitive_levels.length === 0) {
    return "Level kognitif wajib dipilih.";
  }

  if (
    !payload.difficulty_distribution ||
    !Number.isFinite(Number(payload.difficulty_distribution.lots)) ||
    !Number.isFinite(Number(payload.difficulty_distribution.mots)) ||
    !Number.isFinite(Number(payload.difficulty_distribution.hots))
  ) {
    return "Distribusi tingkat kesulitan wajib diisi.";
  }

  const totalDistribution = Number(payload.difficulty_distribution.lots)
    + Number(payload.difficulty_distribution.mots)
    + Number(payload.difficulty_distribution.hots);

  if (totalDistribution !== 100) {
    return "Total distribusi LOTS, MOTS, dan HOTS harus 100%.";
  }

  if (!Array.isArray(payload.topics) || payload.topics.length === 0) {
    return "Minimal satu topik wajib diisi.";
  }

  if (!Array.isArray(payload.formats) || payload.formats.length === 0) {
    return "Minimal satu format soal wajib dipilih.";
  }

  if (payload.formats.some((format) => !format.id || Number(format.count) < 1)) {
    return "Format soal tidak valid.";
  }

  return null;
}
