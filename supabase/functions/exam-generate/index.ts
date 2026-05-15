import { attachIllustrationImages, generateQuestions, totalQuestions, type GenerateExamPayload } from "../_shared/ai.ts";
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

    const { data: exam, error: examError } = await admin
      .from("exam_sessions")
      .insert({
        user_id: freshProfile.id,
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
        topics: payload.topics,
        credits_consumed: requiredCredits,
      })
      .select("*")
      .single();

    if (examError || !exam) {
      throw examError ?? new Error("Gagal menyimpan sesi ujian.");
    }

    const questionRows = questionsWithImages.map((question, index) => ({
      exam_session_id: exam.id,
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

    const { data: questions, error: questionsError } = await admin
      .from("questions")
      .insert(questionRows)
      .select("*")
      .order("order_number", { ascending: true });

    if (questionsError || !questions) {
      throw questionsError ?? new Error("Gagal menyimpan soal.");
    }

    const creditsRemaining = Number(freshProfile.credits_balance) - requiredCredits;
    const { error: creditError } = await admin
      .from("profiles")
      .update({ credits_balance: creditsRemaining })
      .eq("id", freshProfile.id);

    if (creditError) {
      throw creditError;
    }

    await admin.from("credit_transactions").insert({
      user_id: freshProfile.id,
      type: "deduction",
      amount: -requiredCredits,
      description: `Generate ${requiredCredits} soal: ${payload.subject} - ${payload.exam_type}`,
    });

    return jsonResponse({
      message: `Berhasil membuat ${requiredCredits} soal!`,
      exam,
      questions,
      credits_remaining: creditsRemaining,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generate soal gagal.";
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
