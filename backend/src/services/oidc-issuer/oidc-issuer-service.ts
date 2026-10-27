import { Knex } from "knex";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsKeyUsage } from "@app/services/kms/kms-types";

import {
  getKeyRotationPlan,
  getSigningKey,
  OIDC_ISSUER_KEY_NAME_PREFIX,
  OIDC_ISSUER_SIGNING_ALG,
  publicKeyToJwk,
  signJwt
} from "./oidc-issuer-fns";
import { TSignOidcIssuerTokenDTO } from "./oidc-issuer-types";

const TOKEN_TTL_SECONDS = 5 * 60;
const KEY_ROTATION_LOCK_TTL_MS = 30_000;
const KEY_ROTATION_MAX_MS = 2 * 60_000;

type TOidcIssuerServiceFactoryDep = {
  kmsDAL: Pick<TKmsKeyDALFactory, "find" | "delete" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "getPublicKey" | "signWithKmsKey">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "getItem" | "setItemWithExpiry">;
};

type TJwks = { keys: Awaited<ReturnType<typeof publicKeyToJwk>>[] };

export type TOidcIssuerServiceFactory = ReturnType<typeof oidcIssuerServiceFactory>;

export const oidcIssuerServiceFactory = ({ kmsDAL, kmsService, keyStore }: TOidcIssuerServiceFactoryDep) => {
  const $getIssuerUrl = (orgId: string) => {
    const { SITE_URL } = getConfig();
    if (!SITE_URL) {
      throw new BadRequestError({
        message: "The OIDC issuer is unavailable because SITE_URL is not set. Set it to this instance's public URL."
      });
    }

    return `${SITE_URL}/api/v1/oidc-issuer/organizations/${orgId}`;
  };

  // Customers cannot create reserved keys, so the prefix only separates these from the org's other reserved keys
  const $listKeys = async (orgId: string, tx?: Knex) => {
    const keys = await kmsDAL.find(
      { orgId, projectId: null, isReserved: true, keyUsage: KmsKeyUsage.SIGN_VERIFY },
      { sort: [["createdAt", "asc"]], tx }
    );

    return keys.filter(({ name }) => name.startsWith(OIDC_ISSUER_KEY_NAME_PREFIX));
  };

  const $buildJwks = async (keys: { id: string }[], tx?: Knex): Promise<TJwks> => {
    const jwks = await Promise.all(
      keys.map(({ id }) =>
        kmsService
          .getPublicKey({ kmsId: id }, tx)
          .then(publicKeyToJwk)
          .catch((err) => {
            // A concurrent rotation can delete the oldest key, which no longer signs
            if (err instanceof NotFoundError) return null;
            throw err;
          })
      )
    );

    return { keys: jwks.filter((jwk): jwk is NonNullable<typeof jwk> => jwk !== null) };
  };

  const $cacheJwks = (orgId: string, jwks: TJwks) =>
    keyStore.setItemWithExpiry(
      KeyStorePrefixes.OidcIssuerJwks(orgId),
      KeyStoreTtls.OidcIssuerJwksInSeconds,
      JSON.stringify(jwks)
    );

  // A Redis lock rather than an advisory lock, so no database connection is held while RSA keys are generated
  const $rotateKeys = async (orgId: string, waitForLock: boolean) => {
    const acquired = await keyStore
      .acquireLock(
        [KeyStorePrefixes.OidcIssuerKeyRotationLock(orgId)],
        KEY_ROTATION_LOCK_TTL_MS,
        waitForLock ? { retryCount: 20, retryDelay: 500 } : { retryCount: 0 }
      )
      .catch(() => null);
    if (!acquired) return null;

    // Generating keys can outlast the lock: renew it for up to KEY_ROTATION_MAX_MS and write nothing once it is lost
    let lock = acquired;
    let isLockLost = false;
    const deadline = Date.now() + KEY_ROTATION_MAX_MS;
    const renewal = setInterval(() => {
      if (Date.now() > deadline) isLockLost = true;
      if (isLockLost) return;
      void lock.extend?.(KEY_ROTATION_LOCK_TTL_MS).then(
        (renewed) => {
          lock = renewed;
        },
        () => {
          isLockLost = true;
        }
      );
    }, KEY_ROTATION_LOCK_TTL_MS / 3);

    try {
      // A transaction reads the primary, so a rotation another request just finished is not missed on a replica
      const keys = await kmsDAL.transaction((tx) => $listKeys(orgId, tx));
      const { keysToCreate, keyIdsToDelete } = getKeyRotationPlan(keys);

      // Sequential, so createdAt orders the new keys
      for (let i = 0; i < keysToCreate && !isLockLost; i += 1) {
        keys.push(
          // eslint-disable-next-line no-await-in-loop
          await kmsService.generateKmsKey({
            orgId,
            name: `${OIDC_ISSUER_KEY_NAME_PREFIX}${alphaNumericNanoId(8).toLowerCase()}`,
            keyUsage: KmsKeyUsage.SIGN_VERIFY,
            encryptionAlgorithm: AsymmetricKeyAlgorithm.RSA_4096,
            isReserved: true,
            isExportable: false
          })
        );
      }
      if (isLockLost) return null;

      if (keyIdsToDelete.length) await kmsDAL.delete({ $in: { id: keyIdsToDelete } });

      const activeKeys = keys.filter(({ id }) => !keyIdsToDelete.includes(id));
      // Built on the primary, so the first fetch after a rotation cannot come from a replica missing the new keys
      if (keysToCreate) await $cacheJwks(orgId, await kmsDAL.transaction((tx) => $buildJwks(activeKeys, tx)));

      return activeKeys;
    } finally {
      clearInterval(renewal);
      await lock.release();
    }
  };

  const $getSigningKey = async (orgId: string) => {
    let keys = await $listKeys(orgId);

    if (getKeyRotationPlan(keys).keysToCreate) {
      // Only an org with no signing key waits; otherwise another request is rotating and the current key still works
      keys = (await $rotateKeys(orgId, !getSigningKey(keys))) ?? keys;
    }

    const signingKey = getSigningKey(keys);
    if (!signingKey) {
      throw new InternalServerError({
        message: `Timed out creating the OIDC issuer signing keys for organization '${orgId}'. Try again.`
      });
    }

    return signingKey;
  };

  const signToken = async ({ orgId, subject, audience }: TSignOidcIssuerTokenDTO) => {
    const issuer = $getIssuerUrl(orgId);
    const { id: kmsId } = await $getSigningKey(orgId);

    // Read on the primary, because this request may have just created the key
    const [{ kid }, sign] = await kmsDAL.transaction((tx) =>
      Promise.all([
        kmsService.getPublicKey({ kmsId }, tx).then(publicKeyToJwk),
        kmsService.signWithKmsKey({ kmsId }, tx)
      ])
    );

    const iat = Math.floor(Date.now() / 1000);

    return signJwt({
      kid,
      claims: {
        iss: issuer,
        sub: subject,
        aud: audience,
        iat,
        nbf: iat,
        exp: iat + TOKEN_TTL_SECONDS,
        jti: crypto.nativeCrypto.randomUUID()
      },
      sign: async (data) =>
        (await sign({ data, signingAlgorithm: SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256, isDigest: false })).signature
    });
  };

  const getDiscoveryDocument = (orgId: string) => {
    const issuer = $getIssuerUrl(orgId);

    return {
      issuer,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      response_types_supported: ["id_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: [OIDC_ISSUER_SIGNING_ALG],
      scopes_supported: ["openid"],
      // Must list every claim signToken sets
      claims_supported: ["iss", "sub", "aud", "exp", "iat", "nbf", "jti"]
    };
  };

  // Cached so anonymous requests do not each decrypt every key. A stale set is safe: keys are published a period
  // before they sign
  const getJwks = async (orgId: string): Promise<TJwks> => {
    const cached = await keyStore.getItem(KeyStorePrefixes.OidcIssuerJwks(orgId));
    if (cached) return JSON.parse(cached) as TJwks;

    const jwks = await $buildJwks(await $listKeys(orgId));
    // An empty set is never cached, or the first token signed for the org would be checked against it
    if (jwks.keys.length) await $cacheJwks(orgId, jwks);

    return jwks;
  };

  return {
    signToken,
    getDiscoveryDocument,
    getJwks
  };
};
