import { IdentityAuthMethod } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

export const getIdentityActiveLockoutAuthMethods = async (
  identityId: string,
  keyStore: Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem">
) => {
  const activeLockouts = await keyStore.getKeysByPattern(KeyStorePrefixes.IdentityLockoutStatePattern(identityId));

  const activeLockoutAuthMethods = new Set<string>();
  for await (const key of activeLockouts) {
    const parts = key.split(":");
    if (parts.length > 3) {
      const lockoutRaw = await keyStore.getItem(key);
      if (lockoutRaw) {
        const lockout = JSON.parse(lockoutRaw) as { lockedOut: boolean };
        if (lockout.lockedOut) {
          activeLockoutAuthMethods.add(parts[3]);
        }
      }
    }
  }

  return Array.from(activeLockoutAuthMethods);
};

export type TIdentityLockoutLookup = {
  id: string;
  authMethods: IdentityAuthMethod[];
  universalAuthClientId?: string | null;
};

type TLockoutKeyStore = Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem" | "getItems">;

const isLockedOut = (raw: string | null) => {
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { lockedOut?: boolean }).lockedOut === true;
  } catch {
    return false;
  }
};

export const getActiveLockoutAuthMethodsForIdentities = async (
  identities: TIdentityLockoutLookup[],
  keyStore: TLockoutKeyStore
): Promise<Record<string, IdentityAuthMethod[]>> => {
  const result: Record<string, IdentityAuthMethod[]> = {};
  if (!identities.length) return result;

  const add = (identityId: string, method: IdentityAuthMethod) => {
    if (!result[identityId]) result[identityId] = [];
    if (!result[identityId].includes(method)) result[identityId].push(method);
  };

  // Universal auth keys its lockout by client id, which the caller already has, so the
  // whole page resolves in one MGET instead of a keyspace scan per row.
  const exactLookups = identities
    .filter((el) => el.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH) && el.universalAuthClientId)
    .map((el) => ({
      identityId: el.id,
      key: KeyStorePrefixes.IdentityLockoutState(
        el.id,
        IdentityAuthMethod.UNIVERSAL_AUTH,
        el.universalAuthClientId as string
      )
    }));

  if (exactLookups.length) {
    try {
      const values = await keyStore.getItems(exactLookups.map((el) => el.key));
      values.forEach((raw, idx) => {
        if (isLockedOut(raw)) add(exactLookups[idx].identityId, IdentityAuthMethod.UNIVERSAL_AUTH);
      });
    } catch (err) {
      logger.error(err, "Failed to read universal auth lockout state, omitting lockout indicators");
    }
  }

  // LDAP keys its lockout by the submitted username, which lives in the customer's
  // directory and is never persisted here, so those rows still need a pattern lookup.
  const scanLookups = identities.filter(
    (el) =>
      el.authMethods.includes(IdentityAuthMethod.LDAP_AUTH) ||
      (el.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH) && !el.universalAuthClientId)
  );

  await Promise.all(
    scanLookups.map(async (el) => {
      try {
        const methods = await getIdentityActiveLockoutAuthMethods(el.id, keyStore);
        methods.forEach((method) => add(el.id, method as IdentityAuthMethod));
      } catch (err) {
        logger.error(err, `Failed to read lockout state for identity ${el.id}, omitting lockout indicators`);
      }
    })
  );

  return result;
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
