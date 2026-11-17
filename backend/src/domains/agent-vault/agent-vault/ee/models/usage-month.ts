// A calendar month in UTC: the free tier's counting period.
export class UsageMonth {
  private constructor(
    private readonly year: number,
    private readonly monthIndex: number
  ) {}

  static of(at: Date): UsageMonth {
    return new UsageMonth(at.getUTCFullYear(), at.getUTCMonth());
  }

  get key(): string {
    return `${this.year}-${String(this.monthIndex + 1).padStart(2, "0")}`;
  }

  get resetsAt(): Date {
    return new Date(Date.UTC(this.year, this.monthIndex + 1, 1));
  }

  secondsUntilReset(from: Date): number {
    return Math.max(0, Math.ceil((this.resetsAt.getTime() - from.getTime()) / 1000));
  }
}
