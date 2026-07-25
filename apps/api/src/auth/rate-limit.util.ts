/**
 * Simple per-key sliding-window rate limiter (in-process).
 * Good enough to blunt credential stuffing on a single API replica.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the key is allowed; false if over limit. */
  allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const prev = this.hits.get(key) || [];
    const recent = prev.filter((t) => t > cutoff);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Opportunistic cleanup to avoid unbounded growth
    if (this.hits.size > 5000) {
      for (const [k, times] of this.hits) {
        const kept = times.filter((t) => t > cutoff);
        if (kept.length === 0) this.hits.delete(k);
        else this.hits.set(k, kept);
      }
    }
    return true;
  }

  remaining(key: string): number {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) || []).filter((t) => t > cutoff);
    return Math.max(0, this.limit - recent.length);
  }
}
