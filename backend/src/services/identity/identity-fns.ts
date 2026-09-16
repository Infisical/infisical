import { IdentityAuthMethod } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

export type TIdentityLockoutState = {
  lockedOut: boolean;
  failedAttempts: number;
};

const lockoutIndexKey = (identityId: string) => KeyStorePrefixes.IdentityLockoutIndex(identityId);
const lockoutMember = (authMethod: string, slug: string) => KeyStorePrefixes.IdentityLockoutMember(authMethod, slug);
const lockoutItemKey = (identityId: string, authMethod: string, slug: string) =>
  KeyStorePrefixes.IdentityLockoutState(identityId, authMethod, slug);

export const identityLockoutLockKey = (identityId: string, authMethod: string, slug: string) =>
  KeyStorePrefixes.IdentityLockoutLock(lockoutItemKey(identityId, authMethod, slug));

export const getIdentityLockoutState = async (
  { identityId, authMethod, slug }: { identityId: string; authMethod: string; slug: string },
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary">
): Promise<TIdentityLockoutState | undefined> => {
  const raw = await keyStore.getItemPrimary(lockoutItemKey(identityId, authMethod, slug));
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as TIdentityLockoutState;
  } catch {
    // An unreadable value must not fail the login it was read for.
    return undefined;
  }
};

// Runs once per row on the list endpoints. Only locked methods are indexed, so this costs one range
// read bounded by how many of an identity's methods are locked right now
export const getIdentityActiveLockoutAuthMethods = async (
  identityId: string,
  keyStore: Pick<TKeyStoreFactory, "sortedSetRangeByScore">
) => {
  const members = await keyStore.sortedSetRangeByScore(lockoutIndexKey(identityId), Date.now(), "+inf");

  const activeLockoutAuthMethods = new Set<string>();
  members.forEach((member) => {
    const separatorIndex = member.indexOf(":");
    if (separatorIndex > 0) activeLockoutAuthMethods.add(member.slice(0, separatorIndex));
  });

  return Array.from(activeLockoutAuthMethods);
};

// The counter and the lockout share one key and one TTL.
export const persistIdentityLockoutState = async (
  {
    identityId,
    authMethod,
    slug,
    expiryInSeconds
  }: { identityId: string; authMethod: string; slug: string; expiryInSeconds: number },
  lockout: TIdentityLockoutState,
  keyStore: Pick<TKeyStoreFactory, "setIndexedItemWithExpiry">
) => {
  await keyStore.setIndexedItemWithExpiry({
    indexKey: lockoutIndexKey(identityId),
    member: lockoutMember(authMethod, slug),
    itemKey: lockoutItemKey(identityId, authMethod, slug),
    value: JSON.stringify(lockout),
    expiryInSeconds,
    indexed: lockout.lockedOut
  });
};

// Both halves, or the index keeps reporting a lockout whose key is already gone.
export const clearIdentityLockoutState = async (
  { identityId, authMethod, slug }: { identityId: string; authMethod: string; slug: string },
  keyStore: Pick<TKeyStoreFactory, "deleteIndexedItems">
) => {
  await keyStore.deleteIndexedItems({
    indexKey: lockoutIndexKey(identityId),
    members: [lockoutMember(authMethod, slug)],
    itemKeys: [lockoutItemKey(identityId, authMethod, slug)]
  });
};

export const clearIdentityLockoutsForAuthMethod = async (
  identityId: string,
  authMethod: string,
  keyStore: Pick<TKeyStoreFactory, "sortedSetMembersPrimary" | "deleteIndexedItems">
) => {
  const indexKey = lockoutIndexKey(identityId);
  const memberPrefix = `${authMethod}:`;

  const members = await keyStore.sortedSetMembersPrimary(indexKey);
  const matching = members.filter((member) => member.startsWith(memberPrefix));
  if (!matching.length) return 0;

  await keyStore.deleteIndexedItems({
    indexKey,
    members: matching,
    itemKeys: matching.map((member) => lockoutItemKey(identityId, authMethod, member.slice(memberPrefix.length)))
  });

  return matching.length;
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
