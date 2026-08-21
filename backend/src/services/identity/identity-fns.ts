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

// The ingredients of a lockout key rather than the key itself, so callers that hold identity
// rows never have to know the key format. `id` and `universalAuthClientId` are the first and
// last segments of `lockout:identity:<id>:<authMethod>:<slug>`; `authMethods` is not part of
// the format and instead selects which lookup strategy the identity gets below.
export type TIdentityLockoutLookup = {
  id: string;
  authMethods: IdentityAuthMethod[];
  universalAuthClientId?: string | null;
};

type TLockoutKeyStore = Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem" | "getItems">;

// Whatever writes a lockout key for one of these methods must stay resolvable by this reader.
// Adding a method here without teaching `isExactlyResolvable` about it still returns correct
// results, just via the scan fallback below rather than the batched exact-key path.
export const LOCKOUT_CAPABLE_AUTH_METHODS = [IdentityAuthMethod.UNIVERSAL_AUTH, IdentityAuthMethod.LDAP_AUTH];

const isLockedOut = (raw: string | null) => {
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { lockedOut?: boolean }).lockedOut === true;
  } catch {
    return false;
  }
};

// Universal auth keys its lockout by client id, which the caller already has, so it is the only
// lockout-capable method resolvable by exact key. Every other lockout-capable method falls
// through to the pattern scan below.
//
// That fallback is the expensive path, and it is worth removing rather than living with: every
// scan walks the entire Redis keyspace, so a page of LDAP identities still costs one full sweep
// per row and gets slower as the instance accumulates keys, hammering Redis and dragging out
// page load. Making every method exactly resolvable — by persisting the slug each method keys
// its lockout by, so the key can always be derived instead of discovered — would let the whole
// page resolve in one batched read regardless of auth method, and retire the scan for good.
const isExactlyResolvable = (el: TIdentityLockoutLookup, method: IdentityAuthMethod) =>
  method === IdentityAuthMethod.UNIVERSAL_AUTH && Boolean(el.universalAuthClientId);

// A multi-key read is a single round trip on a single-node Redis, but Redis Cluster rejects one
// whose keys span hash slots — and these keys are spread by identity id, so any page holding more
// than one universal auth identity trips it. Retrying as concurrent single-key reads keeps
// clustered deployments accurate, since Cluster routes each read independently: it costs N
// commands but still one round trip of latency, against the N full keyspace scans this path
// replaced. Hash-tagging the keys would avoid the retry entirely, but it would change the key
// format the login path writes and orphan every lockout already held in Redis, so a properly
// cluster-aware batched read is left to the Go rewrite.
const readLockoutStates = async (keyStore: TLockoutKeyStore, keys: string[]) => {
  try {
    return await keyStore.getItems(keys);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("CROSSSLOT")) throw err;
    return Promise.all(keys.map((key) => keyStore.getItem(key)));
  }
};

export const getActiveLockoutAuthMethodsForIdentities = async (
  identities: TIdentityLockoutLookup[],
  keyStore: TLockoutKeyStore
): Promise<Record<string, IdentityAuthMethod[]>> => {
  const result: Record<string, IdentityAuthMethod[]> = {};
  if (!identities.length) return result;

  // Records that an identity is locked out on a method. Both lookup paths below can surface the
  // same identity+method pair, so this deduplicates rather than letting callers push directly.
  const add = (identityId: string, method: IdentityAuthMethod) => {
    if (!result[identityId]) result[identityId] = [];
    if (!result[identityId].includes(method)) result[identityId].push(method);
  };

  // The whole page resolves in one MGET instead of a keyspace scan per row.
  const exactLookups = identities
    .filter((el) => el.authMethods.some((method) => isExactlyResolvable(el, method)))
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
      const values = await readLockoutStates(
        keyStore,
        exactLookups.map((el) => el.key)
      );
      values.forEach((raw, idx) => {
        if (isLockedOut(raw)) add(exactLookups[idx].identityId, IdentityAuthMethod.UNIVERSAL_AUTH);
      });
    } catch (err) {
      logger.error(
        err,
        `Failed to read universal auth lockout state, omitting lockout indicators [identityCount=${exactLookups.length}]`
      );
    }
  }

  // LDAP keys its lockout by the submitted username, which lives in the customer's directory and
  // is never persisted here, so it (and any other lockout-capable method not exactly resolvable
  // above) still needs a pattern lookup.
  const scanLookups = identities.filter((el) =>
    el.authMethods.some((method) => LOCKOUT_CAPABLE_AUTH_METHODS.includes(method) && !isExactlyResolvable(el, method))
  );

  await Promise.all(
    scanLookups.map(async (el) => {
      try {
        // The scan matches every lockout key under this identity, including ones no longer
        // reachable: a method since revoked, or a universal auth key from an earlier attach whose
        // client id has changed. Reporting those resurrects badges for credentials that cannot be
        // used, so keep only methods the identity still holds, and let the exact-key read above be
        // the sole authority for the ones it resolves.
        const methods = await getIdentityActiveLockoutAuthMethods(el.id, keyStore);
        methods.forEach((method) => {
          const authMethod = method as IdentityAuthMethod;
          if (el.authMethods.includes(authMethod) && !isExactlyResolvable(el, authMethod)) {
            add(el.id, authMethod);
          }
        });
      } catch (err) {
        logger.error(err, `Failed to read lockout state, omitting lockout indicators [identityId=${el.id}]`);
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
