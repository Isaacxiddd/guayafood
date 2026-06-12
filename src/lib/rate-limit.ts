const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

const ipHits = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(request: Request): string {
  // x-real-ip is set by Vercel's edge and cannot be spoofed by the client.
  // Fall back to the LAST entry in x-forwarded-for (added by the trusted proxy),
  // never the first (which the client can prepend).
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 45);

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',');
    return parts[parts.length - 1].trim().slice(0, 45);
  }
  return 'unknown';
}

const ALLOWED_ORIGINS = new Set([
  process.env.PUBLIC_SITE_URL || 'https://guayafood.vercel.app',
  'https://guayafood.vercel.app',
  ...(process.env.NODE_ENV === 'development'
    ? ['http://localhost:4321', 'http://localhost:3000', 'http://localhost:4322']
    : []),
]);

export function checkOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''));
}

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = ipHits.get(ip);

  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetIn: WINDOW_MS };
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetIn: entry.resetAt - now };
}
