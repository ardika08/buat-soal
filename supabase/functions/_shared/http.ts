/**
 * Helper header HTTP. Murni tanpa I/O supaya bisa diuji dengan `node --test`.
 */

/** Ambil token dari header `Authorization: Bearer <token>`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
