import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  try {
    const admin = createAdminClient();

    const [{ count: totalUsers, error: usersError }, { count: totalQuestions, error: questionsError }] = await Promise.all([
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true }),
      admin
        .from("questions")
        .select("id", { count: "exact", head: true }),
    ]);

    if (usersError) {
      throw usersError;
    }

    if (questionsError) {
      throw questionsError;
    }

    return jsonResponse({
      live: true,
      total_users: totalUsers ?? 0,
      total_questions: totalQuestions ?? 0,
    });
  } catch (error) {
    return jsonResponse({
      live: true,
      total_users: 0,
      total_questions: 0,
      message: error instanceof Error ? error.message : "Gagal memuat statistik aplikasi.",
    }, 200);
  }
});
