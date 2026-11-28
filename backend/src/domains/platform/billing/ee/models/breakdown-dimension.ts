import { Meter, TUsageBreakdown } from "@app/domains/platform/license/ce/module";

// How a meter's usage breakdown reads: the unit it counts, whether units are listed per project, and whether it is
// split by org at all (user identities are one org-wide figure).
export class BreakdownDimension<K extends string = string> {
  private constructor(
    readonly meter: Meter<K>,
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

  // The keys the API accepts, in this order; the router's enum and the OpenAPI spec come from it.
  static keys() {
    const [first, ...rest] = BreakdownDimension.all().map((dimension) => dimension.key);
    return [first, ...rest] as [TBreakdownDimensionKey, ...TBreakdownDimensionKey[]];
  }

  static fromKey(key: string): BreakdownDimension | null {
    return BreakdownDimension.all().find((dimension) => dimension.meter.key === key) ?? null;
  }

  get key(): K {
    return this.meter.key;
  }

  // Projects to look up names for: only those a project-level row names.
  projectIdsIn(usage: TUsageBreakdown): string[] {
    if (!this.isScoped || !this.hasProjectDetail) return [];
    const projectIds = usage.rows.map((row) => row.projectId).filter((id): id is string => Boolean(id));
    return [...new Set(projectIds)];
  }
}

export type TBreakdownDimensionKey = ReturnType<typeof BreakdownDimension.all>[number]["key"];
