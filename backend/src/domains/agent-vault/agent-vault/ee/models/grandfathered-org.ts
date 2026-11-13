export type TGrandfatheredOrgRecord = {
  orgId: string;
  endedAt: Date | null;
};

export class GrandfatheredOrg {
  private constructor(
    private readonly rootOrgId: string,
    private endedAt: Date | null
  ) {}

  static restore({ orgId, endedAt }: TGrandfatheredOrgRecord): GrandfatheredOrg {
    return new GrandfatheredOrg(orgId, endedAt);
  }

  get orgId(): string {
    return this.rootOrgId;
  }

  get isActive(): boolean {
    return this.endedAt === null;
  }

  // Ended by the org's first purchase, so cancelling later doesn't make it free again.
  end(at: Date = new Date()): void {
    if (this.endedAt === null) this.endedAt = at;
  }

  toJSON(): TGrandfatheredOrgRecord {
    return { orgId: this.rootOrgId, endedAt: this.endedAt };
  }
}
