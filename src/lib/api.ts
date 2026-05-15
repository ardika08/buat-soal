/**
 * api.ts — Axios instance for backend communication.
 *
 * Automatically attaches the Sanctum Bearer token from localStorage
 * to every request and handles 401 (unauthenticated) by clearing
 * the stored token and redirecting to login.
 */

import axios from "axios";

const XAMPP_BASE_URL = "http://localhost/buat-soal/backend/public";

export const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? XAMPP_BASE_URL;

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: false,
});

// ── Request interceptor — attach token ───────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — handle auth errors ────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config as (typeof error.config & { _xamppRetry?: boolean }) | undefined;
    const currentBaseUrl = String(originalRequest?.baseURL ?? "");

    if (!error.response && originalRequest && !originalRequest._xamppRetry && !currentBaseUrl.startsWith(XAMPP_BASE_URL)) {
      originalRequest._xamppRetry = true;
      originalRequest.baseURL = `${XAMPP_BASE_URL}/api`;

      return api.request(originalRequest);
    }

    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      // Redirect to login if token expired
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Typed API helpers ────────────────────────────────────────────────────────

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

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { name: string; email: string; password: string; password_confirmation: string }) =>
    api.post<{ message: string; user: AuthUser; token: string }>("/auth/register", data),

  login: (data: { email: string; password: string }) =>
    api.post<{ message: string; user: AuthUser; token: string }>("/auth/login", data),

  google: (data: { credential: string }) =>
    api.post<{ message: string; user: AuthUser; token: string }>("/auth/google", data),

  logout: () => api.post("/auth/logout"),

  me: () => api.get<{ user: AuthUser }>("/auth/me"),
};

// ─── Exams API ────────────────────────────────────────────────────────────────
export const examsApi = {
  generate: (payload: GenerateExamPayload | FormData) =>
    api.post<GenerateExamResponse>("/exams/generate", payload, payload instanceof FormData ? {
      headers: { "Content-Type": "multipart/form-data" },
    } : undefined),

  list: (page = 1) => api.get<PaginatedExams>("/exams", { params: { page } }),

  get: (id: number) =>
    api.get<{ exam: ExamSession; questions: Question[] }>(`/exams/${id}`),

  updateQuestion: (examId: number, questionId: number, payload: Partial<Question>) =>
    api.put<{ message: string; question: Question }>(`/exams/${examId}/questions/${questionId}`, payload),

  delete: (id: number) => api.delete(`/exams/${id}`),
};

export const billingApi = {
  packages: () => api.get<{ packages: BillingPackage[] }>("/billing/packages"),

  checkout: (packageId: string) =>
    api.post<{ message: string; package: BillingPackage; user: AuthUser }>("/billing/checkout", {
      package_id: packageId,
    }),
};
