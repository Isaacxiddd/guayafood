const TTL_MS = 300_000;
const processed = new Map<string, number>();

export function checkProcessed(id: string): boolean {
  const now = Date.now();
  const entry = processed.get(id);
  if (entry && now < entry) return true;
  processed.set(id, now + TTL_MS);
  return false;
}

export function markProcessed(id: string): void {
  processed.set(id, Date.now() + TTL_MS);
}
