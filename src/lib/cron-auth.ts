/**
 * Shared auth for Vercel Cron routes. Requires `Authorization: Bearer $CRON_SECRET`.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}
