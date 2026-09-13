import { attachIllustrationImages, generateCapaianPembelajaran, generateQuestions, selectAiProvider, totalQuestions, type GenerateExamPayload } from "../_shared/ai.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient, getSupabaseUrl } from "../_shared/supabase.ts";

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

    const payload = await request.json() as GenerateExamPayload;
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
      return jsonResponse({
        error: "insufficient_credits",
        message: `Kredit tidak cukup. Saldo: ${profile.credits_balance}, dibutuhkan: ${requiredCredits}.`,
        credits_balance: Number(profile.credits_balance),
        credits_required: requiredCredits,
      }, 402);
    }

    const provider = selectAiProvider({
      id: Number(profile.id),
      subscription_tier: profile.subscription_tier,
      credits_balance: Number(profile.credits_balance),
      subscription_expiry: profile.subscription_expiry,
    });

    const [generatedQuestions, capaian] = await Promise.all([
      generateQuestions({
        id: Number(profile.id),
        subscription_tier: profile.subscription_tier,
        credits_balance: Number(profile.credits_balance),
        subscription_expiry: profile.subscription_expiry,
      }, payload),
      generateCapaianPembelajaran(provider, payload),
    ]);

    const enrichedTopics = payload.topics.map((topic, index) => ({
      ...topic,
      capaian: capaian[index] ?? "",
    }));

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

    const { data: freshProfile, error: lockError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", profile.id)
      .single();

    if (lockError || !freshProfile) {
      throw lockError ?? new Error("Profil pengguna tidak ditemukan.");
    }

    if (Number(freshProfile.credits_balance) < requiredCredits) {
      return jsonResponse({
        error: "insufficient_credits",
        message: `Kredit tidak cukup. Saldo: ${freshProfile.credits_balance}, dibutuhkan: ${requiredCredits}.`,
        credits_balance: Number(freshProfile.credits_balance),
        credits_required: requiredCredits,
      }, 402);
    }

    const questionRows = questionsWithImages.map((question, index) => ({
      order_number: index + 1,
      question_type: question.question_type,
      cognitive_level: question.cognitive_level,
      difficulty: question.difficulty,
      question_content: question.question_content,
      options: question.options,
      correct_answer: question.correct_answer,
      illustration_prompt: question.illustration_prompt,
      illustration_image: question.illustration_image,
    }));

    const { data: result, error: rpcError } = await admin.rpc("create_exam_with_questions", {
      p_user_id: freshProfile.id,
      p_exam: {
        curriculum: payload.curriculum,
        exam_type: payload.exam_type,
        class_phase: payload.class_phase,
        subject: payload.subject,
        semester: payload.semester,
        time_allocation: payload.time_allocation,
        reference_type: payload.reference_type,
        difficulty: payload.difficulty,
        cognitive_levels: payload.cognitive_levels,
        pg_options: payload.pg_options,
        include_illustration: payload.include_illustration,
        topics: enrichedTopics,
      },
      p_questions: questionRows,
      p_required_credits: requiredCredits,
      p_description: `Generate ${requiredCredits} soal: ${payload.subject} - ${payload.exam_type}`,
    });

    if (rpcError || !result) {
      throw new Error(rpcError?.message ?? "Gagal menyimpan sesi ujian.");
    }

    return jsonResponse({
      message: `Berhasil membuat ${requiredCredits} soal!`,
      exam: result.exam,
      questions: result.questions,
      credits_remaining: result.credits_remaining,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generate soal gagal.";

    if (message.includes("insufficient_credits")) {
      return jsonResponse({
        error: "insufficient_credits",
        message: "Kredit tidak cukup saat menyimpan. Silakan coba lagi.",
      }, 402);
    }

    const status = message.includes("API") ? 503 : 422;
    return jsonResponse({
      error: status === 503 ? "ai_provider_failed" : "ai_invalid_output",
      message,
      debug_url: getSupabaseUrl(),
    }, status);
  }
});

function validatePayload(payload: GenerateExamPayload) {
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
