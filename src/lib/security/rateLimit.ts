import { config } from "@/lib/config";

/**
 * A minimal in-memory sliding-window rate limiter, keyed by client IP.
 *
 * Deliberately simple: this is enough to stop a single client from
 * hammering the (paid, per-token) OpenAI API from one Next.js instance.
 * It is NOT sufficient for a multi-instance production deployment, where
 * each instance has its own memory and a client could get N requests per
 * instance. Swap this module for a shared store (e.g. Redis with a
 * sliding-window or token-bucket script) before scaling horizontally —
 * see docs/DECISIONS.md.
 */
const requestLog = new Map<string, number[]>();

export function checkRateLimit(clientKey: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const windowStart = now - config.rateLimit.windowMs;

  const timestamps = (requestLog.get(clientKey) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= config.rateLimit.maxRequests) {
    const oldest = timestamps[0] ?? now;
    requestLog.set(clientKey, timestamps);
    return { allowed: false, retryAfterMs: oldest + config.rateLimit.windowMs - now };
  }

  timestamps.push(now);
  requestLog.set(clientKey, timestamps);
  return { allowed: true };
}

/** Best-effort client identifier from standard proxy headers, falling back to "unknown". */
export function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
