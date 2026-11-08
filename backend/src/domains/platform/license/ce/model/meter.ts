// "org-tree" counts a root org and its sub-orgs as one, reported at the root. "org" is reported at the org
// whose change triggered the report.
export type TMeterScope = "org" | "org-tree";

// A metered dimension: the License Server prices and caps it, and the instance reports its count.
export class Meter<K extends string = string> {
  private constructor(
    readonly key: K,
    readonly scope: TMeterScope
  ) {}

  static readonly Identities = new Meter("identities", "org");

  // Human users (org members), excluding machine identities. For legacy per-user plans that count seats.
  static readonly UserIdentities = new Meter("user_identities", "org");

  static readonly SecretIdentities = new Meter("secret_identities", "org");

  static readonly PamIdentities = new Meter("pam_identities", "org");

  static readonly AgentVaultIdentities = new Meter("agent_vault_identities", "org");

  static readonly InternalCas = new Meter("internal_cas", "org-tree");

  static readonly ActiveCerts = new Meter("active_certs", "org-tree");

  static readonly WildcardCerts = new Meter("wildcard_certs", "org-tree");

  static all() {
    return [
      Meter.Identities,
      Meter.UserIdentities,
      Meter.SecretIdentities,
      Meter.PamIdentities,
      Meter.AgentVaultIdentities,
      Meter.InternalCas,
      Meter.ActiveCerts,
      Meter.WildcardCerts
    ] as const;
  }
}

export type TMeterKey = ReturnType<typeof Meter.all>[number]["key"];
