// Simpan & lanjutkan niat upgrade E-Book.
//
// POST { operation, return_to?, intent_action? } — operation:
//   "save"   → simpan niat pending (membatalkan niat pending lama)
//   "get"    → niat pending terbaru (atau null)
//   "resume" → tandai niat pending sebagai resumed lalu kembalikan
//   "cancel" → batalkan semua niat pending
//
// Sesi dijaga `requireUser`; mutasi lewat RPC service_role.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { normalizeUpgradeIntent } from "../_shared/emodul-intent.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface IntentRequest {
  operation?: "save" | "get" | "resume" | "cancel";
  return_to?: unknown;
  intent_action?: unknown;
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
    const body = await request.json().catch(() => ({})) as IntentRequest;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    switch (body.operation) {
      case "save": {
        const intent = normalizeUpgradeIntent({
          return_to: body.return_to,
          action: body.intent_action,
        });

        if (!intent) {
          return jsonResponse({
            message: "Niat upgrade tidak valid (return_to harus path internal, aksi harus unduhan).",
          }, 422);
        }

        const { data: saved, error: saveError } = await admin.rpc("save_emodul_upgrade_intent", {
          p_user_id: profile.id,
          p_return_to: intent.return_to,
          p_action: intent.action,
        });

        if (saveError) {
          throw saveError;
        }

        return jsonResponse({ message: "Niat upgrade tersimpan.", intent: saved });
      }

      case "get": {
        const { data: intent, error } = await admin.rpc("get_emodul_upgrade_intent", {
          p_user_id: profile.id,
        });

        if (error) {
          throw error;
        }

        return jsonResponse({ intent: intent ?? null });
      }

      case "resume": {
        const { data: intent, error } = await admin.rpc("resume_emodul_upgrade_intent", {
          p_user_id: profile.id,
        });

        if (error) {
          throw error;
        }

        return jsonResponse({ intent: intent ?? null });
      }

      case "cancel": {
        const { data: cancelled, error } = await admin.rpc("cancel_emodul_upgrade_intent", {
          p_user_id: profile.id,
        });

        if (error) {
          throw error;
        }

        return jsonResponse({ cancelled: Number(cancelled ?? 0) });
      }

      default:
        return jsonResponse({
          message: "Operasi tidak dikenal. Gunakan save/get/resume/cancel.",
        }, 422);
    }
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memproses niat upgrade.",
    }, 500);
  }
});
