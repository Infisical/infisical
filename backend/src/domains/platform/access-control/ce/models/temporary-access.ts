export type TTemporaryAccessRecord = {
  isTemporary?: boolean | null;
  temporaryAccessEndTime?: Date | string | null;
};

// When a role or privilege applies: always when it is permanent, and until its end time when it is temporary. A
// temporary one without an end time never applies.
export class TemporaryAccess {
  private constructor(
    private readonly isTemporary: boolean,
    private readonly endsAt: Date | null
  ) {}

  // Accepts the end time as a string too, as it comes back from a cache.
  static restore({ isTemporary, temporaryAccessEndTime }: TTemporaryAccessRecord): TemporaryAccess {
    return new TemporaryAccess(Boolean(isTemporary), temporaryAccessEndTime ? new Date(temporaryAccessEndTime) : null);
  }

  isActive(now: Date = new Date()): boolean {
    if (!this.isTemporary) return true;
    return Boolean(this.endsAt && now < this.endsAt);
  }
}
