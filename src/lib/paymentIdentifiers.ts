export function paymentInvoiceNumber(orderId: number): string {
  return `INV${formatPaymentId(orderId)}`;
}

export function paymentTransactionNumber(orderId: number): string {
  return `TRX${formatPaymentId(orderId)}`;
}

function formatPaymentId(orderId: number): string {
  const safeId = Number.isInteger(orderId) && orderId > 0 ? orderId : 0;
  return String(safeId).padStart(5, "0");
}
