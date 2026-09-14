import jsPDF from "jspdf";
import type { PaymentOrder } from "@/lib/apiMappers";

export function paymentInvoiceNumber(order: PaymentOrder): string {
  return order.provider_order_id || `SOALIFY-${String(order.id).padStart(8, "0")}`;
}

export function exportPaymentReceipt(order: PaymentOrder): void {
  if (order.status !== "paid") {
    throw new Error("Bukti pembayaran hanya tersedia untuk transaksi yang sudah dibayar.");
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const invoice = paymentInvoiceNumber(order);
  const paidAt = order.paid_at || order.created_at;

  pdf.setFillColor(79, 70, 229);
  pdf.rect(0, 0, 210, 34, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("Soalify", 18, 16);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.text("Bukti Pembayaran", 18, 25);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("PEMBAYARAN BERHASIL", 18, 52);

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(71, 85, 105);
  pdf.text("Dokumen ini merupakan bukti pembayaran layanan Soalify.", 18, 60);

  const rows: Array<[string, string]> = [
    ["Nomor invoice", invoice],
    ["Nomor transaksi", order.provider_transaction_id || "-"],
    ["Tanggal pembayaran", formatDateTime(paidAt)],
    ["Nama pembeli", order.customer_name || "-"],
    ["Email", order.customer_email || "-"],
    ["Produk", packageLabel(order)],
    ["Kredit diberikan", `${order.credits.toLocaleString("id-ID")} kredit`],
    ["Metode", order.provider.toUpperCase()],
    ["Status", "LUNAS"],
  ];

  let y = 76;
  for (const [label, value] of rows) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, 18, y);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 41, 59);
    pdf.text(value, 76, y, { maxWidth: 112 });
    pdf.setDrawColor(226, 232, 240);
    pdf.line(18, y + 4, 192, y + 4);
    y += 13;
  }

  pdf.setFillColor(240, 253, 244);
  pdf.roundedRect(18, y + 3, 174, 24, 3, 3, "F");
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(22, 101, 52);
  pdf.text("Total pembayaran", 25, y + 13);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(formatRupiah(order.amount), 185, y + 14, { align: "right" });

  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Dibuat otomatis pada ${formatDateTime(new Date().toISOString())}`, 18, 282);
  pdf.text("Simpan dokumen ini sebagai arsip pembayaran Anda.", 192, 282, { align: "right" });

  const safeInvoice = invoice.replace(/[^a-zA-Z0-9_-]+/g, "-");
  pdf.save(`bukti-pembayaran-${safeInvoice}.pdf`);
}

function packageLabel(order: PaymentOrder): string {
  if (order.order_type === "subscription" && order.duration_months) {
    return `${order.package_id} (${order.duration_months} bulan)`;
  }
  return order.package_id;
}

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(date);
}
