export type TTemporaryAccessRecord = {
  isTemporary?: boolean | null;
  temporaryAccessEndTime?: Date | string | null;
};

// Permanent access always applies, temporary applies until its end time. Temporary with no end time never applies.
export class TemporaryAccess {
  private constructor(
    private readonly isTemporary: boolean,
    private readonly endsAt: Date | null
  ) {}

  // End time can be a string because the cache hands it back serialized.
  static restore({ isTemporary, temporaryAccessEndTime }: TTemporaryAccessRecord): TemporaryAccess {
    return new TemporaryAccess(Boolean(isTemporary), temporaryAccessEndTime ? new Date(temporaryAccessEndTime) : null);
  }

  isActive(now: Date = new Date()): boolean {
    if (!this.isTemporary) return true;
    return Boolean(this.endsAt && now < this.endsAt);
  }
}
