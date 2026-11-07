// A metered dimension: the License Server prices and caps it, and the instance reports its count.
export type TMeteredFeature<K extends string = string> = { readonly key: K };

const meter = <K extends string>(key: K): TMeteredFeature<K> => ({ key });

export const IdentitiesMeter = meter("identities");
export const InternalCas = meter("internal_cas");
export const ActiveCerts = meter("active_certs");
export const WildcardCerts = meter("wildcard_certs");
export const SecretIdentities = meter("secret_identities");
export const PamIdentities = meter("pam_identities");
export const AgentVaultIdentities = meter("agent_vault_identities");
// Human users (org members), excluding machine identities. For legacy per-user plans that count seats.
export const UserIdentities = meter("user_identities");

export const METERED_FEATURES = [
  IdentitiesMeter,
  InternalCas,
  ActiveCerts,
  WildcardCerts,
  SecretIdentities,
  PamIdentities,
  AgentVaultIdentities,
  UserIdentities
] as const;

export type TMeteredDimensionKey = (typeof METERED_FEATURES)[number]["key"];
