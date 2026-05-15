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

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  subscription_tier: "free" | "basic" | "premium";
  credits_balance: number;
  subscription_expiry: string | null;
}

export interface ExamFormat {
  id: string;
  label: string;
  count: number;
}

export interface Topic {
  topik: string;
  tujuan: string;
}

export interface GenerateExamPayload {
  curriculum: string;
  exam_type: string;
  class_phase: string;
  subject: string;
  semester: string;
  time_allocation: number;
  reference_type: "AI" | "PDF" | "Manual";
  reference_text?: string;
  reference_file?: File | null;
  difficulty: string;
  cognitive_levels: string[];
  pg_options: string | null;
  include_illustration: boolean;
  topics: Topic[];
  formats: ExamFormat[];
}

export interface Question {
  id: number;
  exam_session_id: number;
  order_number: number;
  question_type: string;
  cognitive_level: string;
  difficulty: string;
  question_content: string;
  options: Record<string, string> | null;
  correct_answer: string;
  illustration_prompt: string | null;
  illustration_image: string | null;
}

export interface ExamSession {
  id: number;
  user_id: number;
  curriculum: string;
  exam_type: string;
  class_phase: string;
  subject: string;
  semester: string;
  time_allocation: number;
  reference_type: string;
  difficulty: string;
  cognitive_levels: string[];
  pg_options: string | null;
  include_illustration: boolean;
  topics: Topic[];
  credits_consumed: number;
  questions_count?: number;
  created_at: string;
  questions?: Question[];
}

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

const billingPackages: BillingPackage[] = [
  {
    id: "topup-50",
    type: "topup",
    name: "Top Up 50 Soal",
    description: "Cocok untuk satu paket ujian atau kebutuhan cepat akhir semester.",
    credits: 50,
    price: 25000,
    duration_months: null,
  },
  {
    id: "topup-100",
    type: "topup",
    name: "Top Up 100 Soal",
    description: "Lebih hemat untuk beberapa kelas atau beberapa mapel.",
    credits: 100,
    price: 40000,
    duration_months: null,
  },
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
      data: await invokeFunction<GenerateExamResponse>("exam-generate", normalized),
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

    const exams = (data ?? []).map((exam) => ({
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

    const totalQuestions = (allExamCounts ?? []).reduce((sum, exam) => {
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

  updateQuestion: async (_examId: number, questionId: number, payload: Partial<Question>): ApiResponse<{ message: string; question: Question }> => {
    const { data, error } = await supabase
      .from("questions")
      .update({
        question_type: payload.question_type,
        cognitive_level: payload.cognitive_level,
        difficulty: payload.difficulty,
        question_content: payload.question_content,
        options: payload.options,
        correct_answer: payload.correct_answer,
        illustration_prompt: payload.illustration_prompt,
        illustration_image: payload.illustration_image,
      })
      .eq("id", questionId)
      .select("*")
      .single();

    if (error || !data) {
      throw new ApiError(error?.message ?? "Gagal menyimpan perubahan.", 422);
    }

    return {
      data: {
        message: "Soal berhasil diperbarui.",
        question: normalizeQuestion(data),
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

export const billingApi = {
  packages: async (): ApiResponse<{ packages: BillingPackage[] }> => ({
    data: {
      packages: billingPackages,
    },
  }),

  checkout: async (packageId: string): ApiResponse<{ message: string; package: BillingPackage; user: AuthUser }> => ({
    data: await invokeFunction("billing-checkout", { package_id: packageId }),
  }),
};

async function currentUser(): Promise<AuthUser> {
  return formatUser(await currentProfile());
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

function formatUser(profile: Record<string, unknown>): AuthUser {
  return {
    id: Number(profile.id),
    name: String(profile.name),
    email: String(profile.email),
    subscription_tier: profile.subscription_tier as AuthUser["subscription_tier"],
    credits_balance: Number(profile.credits_balance),
    subscription_expiry: profile.subscription_expiry ? String(profile.subscription_expiry) : null,
  };
}

function normalizeExam(exam: Record<string, unknown>): ExamSession {
  return {
    id: Number(exam.id),
    user_id: Number(exam.user_id),
    curriculum: String(exam.curriculum),
    exam_type: String(exam.exam_type),
    class_phase: String(exam.class_phase),
    subject: String(exam.subject),
    semester: String(exam.semester),
    time_allocation: Number(exam.time_allocation),
    reference_type: String(exam.reference_type),
    difficulty: String(exam.difficulty),
    cognitive_levels: Array.isArray(exam.cognitive_levels) ? exam.cognitive_levels as string[] : [],
    pg_options: exam.pg_options ? String(exam.pg_options) : null,
    include_illustration: Boolean(exam.include_illustration),
    topics: Array.isArray(exam.topics) ? exam.topics as Topic[] : [],
    credits_consumed: Number(exam.credits_consumed),
    created_at: String(exam.created_at),
  };
}

function normalizeQuestion(question: Record<string, unknown>): Question {
  return {
    id: Number(question.id),
    exam_session_id: Number(question.exam_session_id),
    order_number: Number(question.order_number),
    question_type: String(question.question_type),
    cognitive_level: String(question.cognitive_level ?? ""),
    difficulty: String(question.difficulty ?? ""),
    question_content: String(question.question_content),
    options: question.options && typeof question.options === "object"
      ? question.options as Record<string, string>
      : null,
    correct_answer: String(question.correct_answer),
    illustration_prompt: question.illustration_prompt ? String(question.illustration_prompt) : null,
    illustration_image: question.illustration_image ? String(question.illustration_image) : null,
  };
}

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

async function payloadFromFormData(formData: FormData): Promise<GenerateExamPayload & { reference_file_name?: string; reference_file_base64?: string }> {
  const formats = readIndexedObjects<ExamFormat>(formData, "formats", (value) => ({
    id: String(value.id ?? ""),
    label: String(value.label ?? ""),
    count: Number(value.count ?? 0),
  }));
  const topics = readIndexedObjects<Topic>(formData, "topics", (value) => ({
    topik: String(value.topik ?? ""),
    tujuan: String(value.tujuan ?? ""),
  }));
  const cognitiveLevels = readIndexedArray(formData, "cognitive_levels");
  const file = formData.get("reference_file");
  const filePayload = file instanceof File
    ? {
        reference_file_name: file.name,
        reference_file_base64: await fileToBase64(file),
      }
    : {};

  return {
    curriculum: String(formData.get("curriculum") ?? ""),
    exam_type: String(formData.get("exam_type") ?? ""),
    class_phase: String(formData.get("class_phase") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    semester: String(formData.get("semester") ?? ""),
    time_allocation: Number(formData.get("time_allocation") ?? 90),
    reference_type: String(formData.get("reference_type") ?? "AI") as GenerateExamPayload["reference_type"],
    difficulty: String(formData.get("difficulty") ?? ""),
    pg_options: String(formData.get("pg_options") ?? "") || null,
    include_illustration: ["1", "true", "on"].includes(String(formData.get("include_illustration"))),
    cognitive_levels: cognitiveLevels,
    topics,
    formats,
    ...filePayload,
  };
}

function readIndexedArray(formData: FormData, key: string) {
  const values: string[] = [];
  for (const [field, value] of formData.entries()) {
    const match = field.match(new RegExp(`^${key}\\[(\\d+)\\]$`));
    if (match) {
      values[Number(match[1])] = String(value);
    }
  }
  return values.filter(Boolean);
}

function readIndexedObjects<T>(formData: FormData, key: string, map: (value: Record<string, string>) => T) {
  const values: Record<number, Record<string, string>> = {};
  for (const [field, value] of formData.entries()) {
    const match = field.match(new RegExp(`^${key}\\[(\\d+)\\]\\[(\\w+)\\]$`));
    if (match) {
      const index = Number(match[1]);
      values[index] = values[index] ?? {};
      values[index][match[2]] = String(value);
    }
  }
  return Object.keys(values)
    .map(Number)
    .sort((a, b) => a - b)
    .map((index) => map(values[index]));
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
