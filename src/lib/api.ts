import { supabase, SUPABASE_URL } from "@/lib/supabase";

export const BASE_URL = SUPABASE_URL ?? "Supabase belum dikonfigurasi";

type ApiResponse<T> = Promise<{ data: T }>;

class ApiError extends Error {
  response?: {
    status: number;
    data: {
      message?: string;
      error?: string;
      errors?: Record<string, string[]>;
      [key: string]: unknown;
    };
  };

  constructor(message: string, status = 500, data: Record<string, unknown> = {}) {
    super(message);
    this.response = {
      status,
      data: {
        message,
        ...data,
      },
    };
  }
}

// Tipe dan pemetaan data tinggal di ./apiMappers agar bisa diuji tanpa browser.
// Di-ekspor ulang dari sini supaya seluruh kode yang sudah ada tetap jalan.
export type {
  AuthUser,
  ExamFormat,
  Topic,
  DifficultyDistribution,
  GenerateExamPayload,
  Question,
  ExamSession,
  SubscriptionTier,
} from "@/lib/apiMappers";
export {
  formatUser,
  normalizeExam,
  normalizeQuestion,
  payloadFromFormData,
  DEFAULT_TIME_ALLOCATION,
  DEFAULT_DIFFICULTY_DISTRIBUTION,
} from "@/lib/apiMappers";
import {
  formatUser,
  normalizeExam,
  normalizeQuestion,
  payloadFromFormData,
  type AuthUser,
  type ExamSession,
  type GenerateExamPayload,
  type Question,
} from "@/lib/apiMappers";

export interface PaginatedExams {
  data: (ExamSession & { questions_count?: number })[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  total_questions: number;
}

export interface GenerateExamResponse {
  message: string;
  exam: ExamSession;
  questions: Question[];
  credits_remaining: number;
}

export interface BillingPackage {
  id: string;
  type: "topup" | "subscription";
  name: string;
  description: string;
  credits: number;
  price: number;
  duration_months: number | null;
}

export interface BillingPayment {
  order_id: number;
  provider: "mayar";
  status: "pending" | "paid" | "expired" | "failed" | "cancelled";
  checkout_url: string | null;
  provider_order_id?: string | null;
  provider_transaction_id?: string | null;
  amount?: number;
  credits?: number;
}

export interface BillingCheckoutResponse {
  message: string;
  package: BillingPackage;
  payment: BillingPayment;
  user: AuthUser;
}

export interface BillingPaymentStatusResponse {
  message: string;
  payment: BillingPayment;
  user?: AuthUser;
}

export interface BillingCustomer {
  name: string;
  email: string;
  mobile: string;
}

export const CUSTOM_CREDIT_RATE = 200;
export const CUSTOM_TOPUP_MIN = 10;
export const CUSTOM_TOPUP_MAX = 5000;

const billingPackages: BillingPackage[] = [
  {
    id: "premium-6m",
    type: "subscription",
    name: "Premium 6 Bulan",
    description: "Akses model premium dan kuota besar untuk satu semester.",
    credits: 1000,
    price: 149000,
    duration_months: 6,
  },
  {
    id: "premium-12m",
    type: "subscription",
    name: "Premium 12 Bulan",
    description: "Paket tahunan untuk sekolah/guru aktif dengan kuota lebih besar.",
    credits: 2500,
    price: 249000,
    duration_months: 12,
  },
];

export const authApi = {
  register: async (data: { name: string; email: string; password: string; password_confirmation: string }): ApiResponse<{ message: string; user: AuthUser; token: string }> => {
    if (data.password !== data.password_confirmation) {
      throw new ApiError("Konfirmasi password tidak cocok.", 422);
    }

    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
        },
      },
    });

    if (error || !result.session) {
      throw new ApiError(error?.message ?? "Registrasi gagal.", 422);
    }

    localStorage.setItem("auth_token", result.session.access_token);
    return {
      data: {
        message: "Registrasi berhasil!",
        user: await currentUser(),
        token: result.session.access_token,
      },
    };
  },

  login: async (data: { email: string; password: string }): ApiResponse<{ message: string; user: AuthUser; token: string }> => {
    const { data: result, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error || !result.session) {
      throw new ApiError(error?.message ?? "Email atau password tidak valid.", 422);
    }

    localStorage.setItem("auth_token", result.session.access_token);
    return {
      data: {
        message: "Login berhasil!",
        user: await currentUser(),
        token: result.session.access_token,
      },
    };
  },

  google: async (data: { credential: string }): ApiResponse<{ message: string; user: AuthUser; token: string }> => {
    const { data: result, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: data.credential,
    });

    if (error || !result.session) {
      throw new ApiError(error?.message ?? "Login Google gagal.", 422);
    }

    localStorage.setItem("auth_token", result.session.access_token);
    return {
      data: {
        message: "Login Google berhasil!",
        user: await currentUser(),
        token: result.session.access_token,
      },
    };
  },

  logout: async (): ApiResponse<{ message: string }> => {
    await supabase.auth.signOut();
    localStorage.removeItem("auth_token");
    return { data: { message: "Logout berhasil." } };
  },

  me: async (): ApiResponse<{ user: AuthUser }> => ({
    data: {
      user: await currentUser(),
    },
  }),
};

export const examsApi = {
  generate: async (payload: GenerateExamPayload | FormData): ApiResponse<GenerateExamResponse> => {
    const normalized = payload instanceof FormData
      ? await payloadFromFormData(payload)
      : payload;

    return {
      data: await invokeFunction<GenerateExamResponse>("exam-generate", {
        ...normalized,
        // Kunci idempotensi: retry/klik ganda atas request yang sama tidak memotong kredit dua kali.
        idempotency_key: crypto.randomUUID(),
      }),
    };
  },

  list: async (page = 1): ApiResponse<PaginatedExams> => {
    const profile = await currentProfile();
    const perPage = 10;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, error, count } = await supabase
      .from("exam_sessions")
      .select("*, questions(count)", { count: "exact" })
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new ApiError(error.message);
    }

    const exams = (data ?? []).map((exam: Record<string, unknown>) => ({
      ...normalizeExam(exam),
      questions_count: Array.isArray(exam.questions) ? Number(exam.questions[0]?.count ?? 0) : 0,
    }));

    const { data: allExamCounts, error: totalQuestionsError } = await supabase
      .from("exam_sessions")
      .select("id, questions(count)")
      .eq("user_id", profile.id);

    if (totalQuestionsError) {
      throw new ApiError(totalQuestionsError.message);
    }

    const totalQuestions = (allExamCounts ?? []).reduce((sum: number, exam: Record<string, unknown>) => {
      const questionCount = Array.isArray(exam.questions) ? Number(exam.questions[0]?.count ?? 0) : 0;
      return sum + questionCount;
    }, 0);

    return {
      data: {
        data: exams,
        current_page: page,
        last_page: Math.max(1, Math.ceil((count ?? 0) / perPage)),
        per_page: perPage,
        total: count ?? 0,
        total_questions: totalQuestions,
      },
    };
  },

  get: async (id: number): ApiResponse<{ exam: ExamSession; questions: Question[] }> => {
    const profile = await currentProfile();
    const { data: exam, error: examError } = await supabase
      .from("exam_sessions")
      .select("*")
      .eq("id", id)
      .eq("user_id", profile.id)
      .single();

    if (examError || !exam) {
      throw new ApiError(examError?.message ?? "Sesi ujian tidak ditemukan.", 404);
    }

    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .eq("exam_session_id", id)
      .order("order_number", { ascending: true });

    if (questionsError) {
      throw new ApiError(questionsError.message);
    }

    return {
      data: {
        exam: normalizeExam(exam),
        questions: (questions ?? []).map(normalizeQuestion),
      },
    };
  },

  updateQuestion: async (examId: number, questionId: number, payload: Partial<Question>): ApiResponse<{ message: string; question: Question }> => {
    const { data, error } = await supabase.rpc("update_exam_question", {
      p_exam_id: examId,
      p_question_id: questionId,
      p_question: {
        question_type: payload.question_type ?? "",
        cognitive_level: payload.cognitive_level ?? "",
        difficulty: payload.difficulty ?? "",
        question_content: payload.question_content ?? "",
        options: payload.options ?? null,
        correct_answer: payload.correct_answer ?? "",
        explanation: payload.explanation ?? "",
        illustration_prompt: payload.illustration_prompt ?? "",
        illustration_image: payload.illustration_image ?? "",
      },
    });

    if (error || !data) {
      const raw = error?.message ?? "";
      const message = raw.includes("question_required")
        ? "Pertanyaan wajib diisi."
        : raw.includes("answer_required")
          ? "Kunci jawaban wajib diisi."
          : raw.includes("minimum_options")
            ? "Pilihan ganda harus memiliki minimal dua opsi."
            : raw.includes("invalid_answer_key")
              ? "Kunci jawaban harus cocok dengan salah satu opsi."
              : raw || "Gagal menyimpan perubahan.";
      throw new ApiError(message, 422);
    }

    return {
      data: {
        message: "Soal berhasil diperbarui.",
        question: normalizeQuestion(data as Record<string, unknown>),
      },
    };
  },

  addQuestion: async (
    examId: number,
    afterOrder: number | null,
    payload: Partial<Question>,
  ): ApiResponse<{ message: string; question: Question }> => {
    const { data, error } = await supabase.rpc("add_exam_question", {
      p_exam_id: examId,
      p_after_order: afterOrder,
      p_question: {
        question_type: payload.question_type ?? "Pilihan Ganda",
        cognitive_level: payload.cognitive_level ?? "",
        difficulty: payload.difficulty ?? "",
        question_content: payload.question_content ?? "",
        options: payload.options ?? null,
        correct_answer: payload.correct_answer ?? "",
        explanation: payload.explanation ?? "",
        illustration_prompt: payload.illustration_prompt ?? "",
        illustration_image: payload.illustration_image ?? "",
      },
    });

    if (error || !data) {
      throw new ApiError(error?.message ?? "Gagal menambahkan soal.", 422);
    }

    return {
      data: {
        message: "Soal berhasil ditambahkan.",
        question: normalizeQuestion(data as Record<string, unknown>),
      },
    };
  },

  deleteQuestion: async (
    examId: number,
    questionId: number,
  ): ApiResponse<{ message: string }> => {
    const { error } = await supabase.rpc("delete_exam_question", {
      p_exam_id: examId,
      p_question_id: questionId,
    });

    if (error) {
      const message =
        error.message.includes("last_question")
          ? "Tidak bisa menghapus soal terakhir. Ujian harus punya minimal satu soal."
          : error.message;
      throw new ApiError(message, 422);
    }

    return { data: { message: "Soal berhasil dihapus." } };
  },

  reorderQuestions: async (
    examId: number,
    orderedIds: number[],
  ): ApiResponse<{ message: string; questions: Question[] }> => {
    const { data, error } = await supabase.rpc("reorder_exam_questions", {
      p_exam_id: examId,
      p_ordered_ids: orderedIds,
    });

    if (error || !data) {
      throw new ApiError(error?.message ?? "Gagal mengurutkan soal.", 422);
    }

    const payload = data as { questions?: Record<string, unknown>[] };
    return {
      data: {
        message: "Urutan soal diperbarui.",
        questions: (payload.questions ?? []).map(normalizeQuestion),
      },
    };
  },

  regenerateQuestion: async (
    questionId: number,
    instruction?: string,
  ): ApiResponse<{ message: string; question: Question; credits_remaining: number }> => {
    const result = await invokeFunction<{
      question: Record<string, unknown>;
      credits_remaining: number;
    }>("question-regenerate", {
      question_id: questionId,
      instruction: instruction?.trim() || undefined,
      idempotency_key: crypto.randomUUID(),
    });

    return {
      data: {
        message: "Soal berhasil dibuat ulang.",
        question: normalizeQuestion(result.question),
        credits_remaining: Number(result.credits_remaining ?? 0),
      },
    };
  },

  delete: async (id: number): ApiResponse<{ message: string }> => {
    const { error } = await supabase
      .from("exam_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      throw new ApiError(error.message, 422);
    }

    return { data: { message: "Sesi ujian berhasil dihapus." } };
  },
};

export interface SalesProofEntry {
  display_name: string;
  purchase_label: string;
  paid_at: string;
}

export const marketingApi = {
  salesProof: async (): ApiResponse<{ entries: SalesProofEntry[] }> => ({
    data: await invokeFunction("sales-proof", {}),
  }),
};

export const billingApi = {
  packages: async (): ApiResponse<{ packages: BillingPackage[] }> => ({
    data: {
      packages: billingPackages,
    },
  }),

  checkout: async (packageId: string, customer: BillingCustomer): ApiResponse<BillingCheckoutResponse> => ({
    data: await invokeFunction("billing-checkout", {
      package_id: packageId,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_mobile: customer.mobile,
    }),
  }),

  checkoutCustomCredits: async (credits: number, customer: BillingCustomer): ApiResponse<BillingCheckoutResponse> => ({
    data: await invokeFunction("billing-checkout", {
      credits: Math.floor(credits),
      customer_name: customer.name,
      customer_email: customer.email,
      customer_mobile: customer.mobile,
    }),
  }),

  checkPaymentStatus: async (orderId: number | string): ApiResponse<BillingPaymentStatusResponse> => ({
    data: await invokeFunction("billing-payment-status", {
      order_id: Number(orderId),
    }),
  }),
};

async function currentUser(): Promise<AuthUser> {
  const profile = await currentProfile();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("user_id", profile.id)
    .eq("type", "topup")
    .limit(1);

  if (error) {
    console.warn("Gagal memeriksa riwayat top-up:", error.message);
  }

  return formatUser({
    ...profile,
    has_purchased_credits: !error && (data?.length ?? 0) > 0,
  });
}

async function currentProfile() {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    throw new ApiError("Sesi login belum aktif. Silakan login ulang.", 401);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (data && !error) {
      return data;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  throw new ApiError("Profil pengguna belum tersedia di Supabase.", 404);
}

/** Melempar ApiError berisi pesan asli dari Edge Function, bukan pesan generik. */
async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown>,
  });

  if (error) {
    const maybeResponse = (error as { context?: Response }).context;
    if (maybeResponse instanceof Response) {
      const status = maybeResponse.status;
      const payload = await maybeResponse.json().catch(() => ({ message: error.message }));
      throw new ApiError(payload.message ?? error.message, status, payload);
    }

    throw new ApiError(error.message);
  }

  return data as T;
}
