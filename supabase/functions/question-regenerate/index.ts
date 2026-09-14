// Regenerasi satu soal: memakai metadata ujian + soal lama sebagai konteks,
// meminta AI membuat satu soal pengganti dengan tipe yang sama, lalu memotong
// 1 kredit secara atomik dan idempoten (via idempotency_key pada ledger).

import { generateQuestions, type GenerateExamPayload } from "../_shared/ai.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

const REGENERATE_COST = 1;

interface RegenerateRequest {
  question_id?: number;
  instruction?: string;
  idempotency_key?: string;
}

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

    const body = await request.json() as RegenerateRequest;
    const questionId = Number(body.question_id);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return jsonResponse({ message: "question_id tidak valid." }, 422);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    // Ambil soal lama beserta sesi ujiannya, sekaligus verifikasi kepemilikan.
    const { data: question, error: questionError } = await admin
      .from("questions")
      .select("*, exam_sessions!inner(*)")
      .eq("id", questionId)
      .eq("exam_sessions.user_id", profile.id)
      .single();

    if (questionError || !question) {
      return jsonResponse({ message: "Soal tidak ditemukan atau bukan milik Anda." }, 404);
    }

    if (Number(profile.credits_balance) < REGENERATE_COST) {
      return jsonResponse({
        error: "insufficient_credits",
        message: `Kredit tidak cukup. Saldo: ${profile.credits_balance}, dibutuhkan: ${REGENERATE_COST}.`,
        credits_balance: Number(profile.credits_balance),
        credits_required: REGENERATE_COST,
      }, 402);
    }

    const exam = question.exam_sessions as Record<string, unknown>;
    const payload = buildRegeneratePayload(exam, question, body.instruction);

    const generated = await generateQuestions({
      id: Number(profile.id),
      subscription_tier: profile.subscription_tier,
      credits_balance: Number(profile.credits_balance),
      subscription_expiry: profile.subscription_expiry,
    }, payload);

    const fresh = generated[0];
    if (!fresh) {
      return jsonResponse({ message: "AI tidak menghasilkan soal. Coba lagi." }, 502);
    }

    const { data: result, error: rpcError } = await admin.rpc("regenerate_question_with_credit", {
      p_user_id: profile.id,
      p_question_id: questionId,
      p_question: {
        question_type: fresh.question_type,
        cognitive_level: fresh.cognitive_level,
        difficulty: fresh.difficulty,
        question_content: fresh.question_content,
        options: fresh.options,
        correct_answer: fresh.correct_answer,
        explanation: "",
        illustration_prompt: fresh.illustration_prompt ?? "",
        illustration_image: "",
      },
      p_cost: REGENERATE_COST,
      p_idempotency_key: body.idempotency_key ?? null,
    });

    if (rpcError) {
      const message = String(rpcError.message ?? "");
      if (message.includes("insufficient_credits")) {
        return jsonResponse({ error: "insufficient_credits", message: "Kredit tidak cukup." }, 402);
      }
      if (message.includes("forbidden")) {
        return jsonResponse({ message: "Soal bukan milik Anda." }, 403);
      }
      throw rpcError;
    }

    return jsonResponse({
      question: result.question,
      credits_remaining: result.credits_remaining,
    });
  } catch (error) {
    console.error("[question-regenerate]", error);
    return jsonResponse({ message: "Gagal membuat ulang soal." }, 500);
  }
});

// Membuat payload generate berisi tepat satu soal, mewarisi konteks ujian dan
// jenis/topik soal lama. Instruksi opsional dari guru ditempel ke tujuan topik.
function buildRegeneratePayload(
  exam: Record<string, unknown>,
  question: Record<string, unknown>,
  instruction?: string,
): GenerateExamPayload {
  const questionType = String(question.question_type ?? "Pilihan Ganda");
  const cognitiveLevel = String(question.cognitive_level ?? "");
  const difficulty = String(question.difficulty ?? exam.difficulty ?? "Sedang");
  const topics = Array.isArray(exam.topics) ? exam.topics as GenerateExamPayload["topics"] : [];
  const baseTopic = topics[0] ?? { topik: String(exam.subject ?? ""), tujuan: "" };
  const tujuan = instruction && instruction.trim()
    ? `${baseTopic.tujuan} (Instruksi tambahan: ${instruction.trim()})`
    : baseTopic.tujuan;
  const oldQuestion = String(question.question_content ?? "");

  return {
    curriculum: String(exam.curriculum ?? ""),
    exam_type: String(exam.exam_type ?? ""),
    class_phase: String(exam.class_phase ?? ""),
    subject: String(exam.subject ?? ""),
    semester: String(exam.semester ?? "Ganjil"),
    time_allocation: Number(exam.time_allocation ?? 90),
    reference_type: "Manual",
    reference_text: `Buat soal baru yang berbeda sebagai pengganti soal lama berikut, tetapi tetap menguji kompetensi yang sama: ${oldQuestion}`,
    difficulty,
    cognitive_levels: cognitiveLevel ? [cognitiveLevel] : [],
    difficulty_distribution: difficultyDistribution(cognitiveLevel, difficulty),
    pg_options: (exam.pg_options ?? null) as string | null,
    include_illustration: false,
    topics: [{ ...baseTopic, tujuan }],
    formats: [{ id: formatId(questionType), label: questionType, count: 1 }],
  };
}

function formatId(questionType: string) {
  const normalized = questionType.toLowerCase();
  if (normalized.includes("kompleks") || normalized === "pgk") return "pgk";
  if (normalized.includes("pilihan ganda") || normalized === "pg") return "pg";
  if (normalized.includes("benar") || normalized.includes("salah")) return "bs";
  if (normalized.includes("isian")) return "isian";
  if (normalized.includes("menjodohkan")) return "menjodohkan";
  return "uraian";
}

function difficultyDistribution(cognitiveLevel: string, difficulty: string) {
  const level = cognitiveLevel.toUpperCase();
  if (/C[56]/.test(level) || difficulty.toLowerCase() === "sulit") {
    return { lots: 0, mots: 0, hots: 100 };
  }
  if (/C[34]/.test(level) || difficulty.toLowerCase() === "sedang") {
    return { lots: 0, mots: 100, hots: 0 };
  }
  return { lots: 100, mots: 0, hots: 0 };
}
