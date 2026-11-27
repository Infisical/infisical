// "org-tree": root and sub-orgs count as one, reported at the root. "org": reported at the org that changed.
export type TMeterScope = "org" | "org-tree";

// "count": a domain registers a counter and License reports its current value. "events": the owning domain records
// each fact through recordMeteringEvents, so there is nothing to count.
export type TMeterSource = "count" | "events";

export class Meter<K extends string = string, S extends TMeterSource = TMeterSource> {
  private constructor(
    readonly key: K,
    readonly scope: TMeterScope,
    readonly source: S
  ) {}

  static readonly Identities = new Meter("identities", "org", "count");

  // Human users (org members), excluding machine identities. For legacy per-user plans that count seats.
  static readonly UserIdentities = new Meter("user_identities", "org", "count");

  static readonly SecretIdentities = new Meter("secret_identities", "org", "count");

  static readonly PamIdentities = new Meter("pam_identities", "org", "count");

  // Billed to the root org, like the PKI meters.
  static readonly AgentVaultBrokeredRequests = new Meter("agent_vault_brokered_requests", "org-tree", "events");

  static readonly InternalCas = new Meter("internal_cas", "org-tree", "count");

  static readonly ActiveCerts = new Meter("active_certs", "org-tree", "count");

  static readonly WildcardCerts = new Meter("wildcard_certs", "org-tree", "count");

  static all() {
    return [
      Meter.Identities,
      Meter.UserIdentities,
      Meter.SecretIdentities,
      Meter.PamIdentities,
      Meter.AgentVaultBrokeredRequests,
      Meter.InternalCas,
      Meter.ActiveCerts,
      Meter.WildcardCerts
    ] as const;
  }

  private static readonly byKey: ReadonlyMap<string, Meter> = new Map(Meter.all().map((meter) => [meter.key, meter]));

  // For keys that arrive as strings: queued jobs (old pods share them) and License Server catalog dimensions.
  static fromKey(key: string): Meter | null {
    return Meter.byKey.get(key) ?? null;
  }
}

export type TMeterKey = ReturnType<typeof Meter.all>[number]["key"];

// The meters a domain must register a counter for; "events" meters are recorded, not counted.
export type TCountMeterKey = Extract<ReturnType<typeof Meter.all>[number], Meter<string, "count">>["key"];
