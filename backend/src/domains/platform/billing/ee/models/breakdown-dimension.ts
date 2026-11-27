import { Meter } from "@app/domains/platform/license/ce/module";

// How a meter's usage breakdown reads: the unit it counts, whether units are listed per project, and whether it is
// split by org at all (user identities are one org-wide figure).
export class BreakdownDimension {
  private constructor(
    readonly meter: Meter,
    readonly unit: string,
    readonly hasProjectDetail: boolean,
    readonly isScoped: boolean
  ) {}

  static readonly Identities = new BreakdownDimension(Meter.Identities, "machine identity", true, true);

  static readonly UserIdentities = new BreakdownDimension(Meter.UserIdentities, "user identity", false, false);

  static readonly SecretIdentities = new BreakdownDimension(Meter.SecretIdentities, "secret identity", true, true);

  // PAM identities are counted per org only.
  static readonly PamIdentities = new BreakdownDimension(Meter.PamIdentities, "PAM identity", false, true);

  static readonly InternalCas = new BreakdownDimension(Meter.InternalCas, "internal CA", false, true);

  static readonly ActiveCerts = new BreakdownDimension(Meter.ActiveCerts, "active certificate", false, true);

  static readonly WildcardCerts = new BreakdownDimension(Meter.WildcardCerts, "wildcard certificate", false, true);

  static all() {
    return [
      BreakdownDimension.Identities,
      BreakdownDimension.UserIdentities,
      BreakdownDimension.SecretIdentities,
      BreakdownDimension.PamIdentities,
      BreakdownDimension.InternalCas,
      BreakdownDimension.ActiveCerts,
      BreakdownDimension.WildcardCerts
    ] as const;
  }

  static fromKey(key: string): BreakdownDimension | null {
    return BreakdownDimension.all().find((dimension) => dimension.meter.key === key) ?? null;
  }

  get key(): string {
    return this.meter.key;
  }
}

export type TBreakdownDimensionKey = ReturnType<typeof BreakdownDimension.all>[number]["meter"]["key"];
