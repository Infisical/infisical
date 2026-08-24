import { IdentityAuthMethod } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

export type TIdentityLockoutState = {
  lockedOut: boolean;
  failedAttempts: number;
  // Redis cannot expire an individual hash field. The key's TTL only garbage-collects the whole
  // hash once its longest-lived field is gone, so this deadline is what makes a read correct.
  expiresAt?: number;
};

const parseLockoutState = (raw: string): TIdentityLockoutState | null => {
  try {
    return JSON.parse(raw) as TIdentityLockoutState;
  } catch {
    // A single unreadable field must not fail the whole list page it was read for.
    return null;
  }
};

const isLive = (state: TIdentityLockoutState, now: number) => !state.expiresAt || state.expiresAt > now;

const lockoutHashKey = (identityId: string) => KeyStorePrefixes.IdentityLockoutStateHash(identityId);
const lockoutField = (authMethod: string, slug: string) => KeyStorePrefixes.IdentityLockoutStateField(authMethod, slug);

// Named after the hash key and field so the login paths serialise per lockout rather than per identity.
export const identityLockoutLockKey = (identityId: string, authMethod: string, slug: string) =>
  KeyStorePrefixes.IdentityLockoutLock(`${lockoutHashKey(identityId)}:${lockoutField(authMethod, slug)}`);

export const getIdentityLockoutState = async (
  { identityId, authMethod, slug }: { identityId: string; authMethod: string; slug: string },
  keyStore: Pick<TKeyStoreFactory, "hashGet">
): Promise<TIdentityLockoutState | undefined> => {
  const raw = await keyStore.hashGet(lockoutHashKey(identityId), lockoutField(authMethod, slug));
  if (!raw) return undefined;

  const state = parseLockoutState(raw);
  if (!state || !isLive(state, Date.now())) return undefined;

  return state;
};

export const getIdentityActiveLockoutAuthMethods = async (
  identityId: string,
  keyStore: Pick<TKeyStoreFactory, "hashGetAll">
) => {
  const lockoutStates = await keyStore.hashGetAll(lockoutHashKey(identityId));

  const now = Date.now();
  const activeLockoutAuthMethods = new Set<string>();

  Object.entries(lockoutStates ?? {}).forEach(([field, raw]) => {
    const separatorIndex = field.indexOf(":");
    if (separatorIndex <= 0) return;

    const state = parseLockoutState(raw);
    if (!state?.lockedOut || !isLive(state, now)) return;

    activeLockoutAuthMethods.add(field.slice(0, separatorIndex));
  });

  return Array.from(activeLockoutAuthMethods);
};

// The key TTL never shortens, so it always outlives the longest-lived field; expiresAt is what
// retires this one.
export const persistIdentityLockoutState = async (
  {
    identityId,
    authMethod,
    slug,
    expiryInSeconds
  }: { identityId: string; authMethod: string; slug: string; expiryInSeconds: number },
  lockout: { lockedOut: boolean; failedAttempts: number },
  keyStore: Pick<TKeyStoreFactory, "hashSetFieldWithMinExpiry">
) => {
  await keyStore.hashSetFieldWithMinExpiry(
    lockoutHashKey(identityId),
    lockoutField(authMethod, slug),
    JSON.stringify({ ...lockout, expiresAt: Date.now() + expiryInSeconds * 1000 }),
    expiryInSeconds
  );
};

export const clearIdentityLockoutState = async (
  { identityId, authMethod, slug }: { identityId: string; authMethod: string; slug: string },
  keyStore: Pick<TKeyStoreFactory, "hashDeleteFields">
) => {
  await keyStore.hashDeleteFields(lockoutHashKey(identityId), [lockoutField(authMethod, slug)]);
};

// The field names carry the slugs, so the whole set for one method is addressable without the
// pattern delete (a full keyspace SCAN) this replaced.
export const clearIdentityLockoutsForAuthMethod = async (
  identityId: string,
  authMethod: string,
  keyStore: Pick<TKeyStoreFactory, "hashGetAllPrimary" | "hashDeleteFields">
) => {
  const hashKey = lockoutHashKey(identityId);
  const fieldPrefix = `${authMethod}:`;

  // Primary, not a replica: this read decides what gets deleted, and a lagging replica would hide
  // a lockout the admin just asked to clear.
  const lockoutStates = await keyStore.hashGetAllPrimary(hashKey);
  const fields = Object.keys(lockoutStates ?? {}).filter((field) => field.startsWith(fieldPrefix));
  if (!fields.length) return 0;

  return keyStore.hashDeleteFields(hashKey, fields);
};

export const buildAuthMethods = ({
  uaId,
  gcpId,
  alicloudId,
  awsId,
  kubernetesId,
  ociId,
  oidcId,
  azureId,
  tokenId,
  jwtId,
  ldapId,
  tlsCertId,
  spiffeId
}: {
  uaId?: string;
  gcpId?: string;
  alicloudId?: string;
  awsId?: string;
  kubernetesId?: string;
  ociId?: string;
  oidcId?: string;
  azureId?: string;
  tokenId?: string;
  jwtId?: string;
  ldapId?: string;
  tlsCertId?: string;
  spiffeId?: string;
}) => {
  return [
    ...[uaId ? IdentityAuthMethod.UNIVERSAL_AUTH : null],
    ...[gcpId ? IdentityAuthMethod.GCP_AUTH : null],
    ...[alicloudId ? IdentityAuthMethod.ALICLOUD_AUTH : null],
    ...[awsId ? IdentityAuthMethod.AWS_AUTH : null],
    ...[kubernetesId ? IdentityAuthMethod.KUBERNETES_AUTH : null],
    ...[ociId ? IdentityAuthMethod.OCI_AUTH : null],
    ...[oidcId ? IdentityAuthMethod.OIDC_AUTH : null],
    ...[azureId ? IdentityAuthMethod.AZURE_AUTH : null],
    ...[tokenId ? IdentityAuthMethod.TOKEN_AUTH : null],
    ...[jwtId ? IdentityAuthMethod.JWT_AUTH : null],
    ...[ldapId ? IdentityAuthMethod.LDAP_AUTH : null],
    ...[tlsCertId ? IdentityAuthMethod.TLS_CERT_AUTH : null],
    ...[spiffeId ? IdentityAuthMethod.SPIFFE_AUTH : null]
  ].filter((authMethod) => authMethod) as IdentityAuthMethod[];
};
