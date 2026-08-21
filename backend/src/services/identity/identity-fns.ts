import { IdentityAuthMethod } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

// Only the scan fallback below reaches for this. Every caller that holds identity rows goes
// through `getActiveLockoutAuthMethodsForIdentities`, which resolves a whole page at once.
const getIdentityActiveLockoutAuthMethods = async (
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

// A lockout state that could not be read is not the same as "not locked out", and an empty method
// array cannot say so. Callers surface `unreadableIdentityIds` separately so an admin looking at a
// list during a Redis failure sees that the indicator is unavailable rather than a clean row.
export type TIdentityLockoutStates = {
  lockoutsByIdentityId: Record<string, IdentityAuthMethod[]>;
  unreadableIdentityIds: Set<string>;
};

export const getActiveLockoutAuthMethodsForIdentities = async (
  identities: TIdentityLockoutLookup[],
  keyStore: TLockoutKeyStore
): Promise<TIdentityLockoutStates> => {
  const lockoutsByIdentityId: Record<string, IdentityAuthMethod[]> = {};
  const unreadableIdentityIds = new Set<string>();
  if (!identities.length) return { lockoutsByIdentityId, unreadableIdentityIds };

  // Records that an identity is locked out on a method. Both lookup paths below can surface the
  // same identity+method pair, so this deduplicates rather than letting callers push directly.
  const add = (identityId: string, method: IdentityAuthMethod) => {
    if (!lockoutsByIdentityId[identityId]) lockoutsByIdentityId[identityId] = [];
    if (!lockoutsByIdentityId[identityId].includes(method)) lockoutsByIdentityId[identityId].push(method);
  };

  // The whole page resolves in one batched read instead of a keyspace scan per row.
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
      const values = await keyStore.getItems(exactLookups.map((el) => el.key));
      values.forEach((raw, idx) => {
        if (isLockedOut(raw)) add(exactLookups[idx].identityId, IdentityAuthMethod.UNIVERSAL_AUTH);
      });
    } catch (err) {
      // One batched read covers every universal auth identity on the page, so a failure leaves all
      // of them unknown at once. Reporting them keeps the page rendering while still telling the
      // caller that these particular rows carry no verdict.
      exactLookups.forEach((el) => unreadableIdentityIds.add(el.identityId));
      logger.error(
        err,
        `Failed to read universal auth lockout state [identityIds=${exactLookups.map((el) => el.identityId).join(",")}]`
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
        unreadableIdentityIds.add(el.id);
        logger.error(err, `Failed to read lockout state [identityId=${el.id}]`);
      }
    })
  );

  return { lockoutsByIdentityId, unreadableIdentityIds };
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
