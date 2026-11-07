export class WebFrameRateLimiter {
  private tokens: number;
  private updatedAt: number;
  constructor(
    private rate: number,
    private burst: number,
    now = performance.now()
  ) {
    this.tokens = burst;
    this.updatedAt = now;
  }
  accept(now = performance.now()) {
    this.tokens = Math.min(this.burst, this.tokens + (Math.max(0, now - this.updatedAt) * this.rate) / 1000);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
