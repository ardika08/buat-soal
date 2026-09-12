/**
 * Logika halaman kembali dari pembayaran (`/billing/return`).
 *
 * Setelah membayar di Mayar, browser pengguna diarahkan kembali ke aplikasi. Halaman itu
 * harus tahu ORDER MANA yang sedang dikonfirmasi, lalu memantau statusnya sampai final.
 * Fungsi di sini murni supaya bisa diuji tanpa browser.
 */

/** Batas jumlah pemeriksaan status sebelum halaman berhenti memantau. */
export const MAX_STATUS_POLLS = 10;

/**
 * Menentukan order id yang diperiksa.
 *
 * Prioritas: query string (dari URL kembali Mayar), lalu order terakhir yang disimpan
 * browser oleh dialog checkout saat invoice dibuat. Cadangan terakhir diperlukan karena
 * tidak semua konfigurasi Mayar mengembalikan query tambahan kita.
 */
export function resolveOrderId(search: string, storedOrderId: string | null): number | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  for (const key of ["order_id", "orderId"]) {
    const parsed = parseOrderId(params.get(key));
    if (parsed !== null) {
      return parsed;
    }
  }

  return parseOrderId(storedOrderId);
}

/** Order id harus bilangan bulat positif; nilai lain diabaikan agar tidak menebak order orang lain. */
function parseOrderId(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Status final tidak perlu dipantau lagi. */
const FINAL_STATUSES = new Set(["paid", "expired", "failed", "cancelled"]);

export function shouldKeepPolling(status: string, attempts: number, maxAttempts = MAX_STATUS_POLLS) {
  if (attempts >= maxAttempts) {
    return false;
  }
  return !FINAL_STATUSES.has(status);
}

export type PaymentTone = "success" | "pending" | "failed";

/**
 * Pesan yang dilihat pengguna setelah kembali dari pembayaran.
 *
 * Status tak dikenal diperlakukan sebagai `pending`, bukan gagal: lebih baik menunggu
 * daripada memberi tahu pengguna bahwa pembayaran gagal padahal kreditnya sedang diproses.
 */
export function describeOutcome(status: string): { tone: PaymentTone; message: string } {
  switch (status) {
    case "paid":
      return { tone: "success", message: "Pembayaran berhasil. Kredit sudah ditambahkan ke akun Anda." };
    case "expired":
      return { tone: "failed", message: "Batas waktu pembayaran habis. Silakan buat pesanan baru." };
    case "failed":
      return { tone: "failed", message: "Pembayaran gagal diproses. Anda belum dikenakan biaya; silakan coba lagi." };
    case "cancelled":
      return { tone: "failed", message: "Pembayaran dibatalkan. Tidak ada kredit yang ditambahkan." };
    default:
      return { tone: "pending", message: "Pembayaran Anda sedang diverifikasi. Halaman ini akan memperbarui statusnya sendiri." };
  }
}
