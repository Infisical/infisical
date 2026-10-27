import { Knex } from "knex";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory, TKeyStoreLock } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
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

type TOidcIssuerServiceFactoryDep = {
  kmsDAL: Pick<TKmsKeyDALFactory, "find" | "delete" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "getPublicKey" | "signWithKmsKey">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "getItem" | "setItemWithExpiry" | "deleteItem">;
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

  // Issuer keys are reserved, so no customer can create one; the prefix only tells them apart from the
  // org's other reserved keys.
  const $listKeys = async (orgId: string, tx?: Knex) => {
    const keys = await kmsDAL.find(
      { orgId, projectId: null, isReserved: true, keyUsage: KmsKeyUsage.SIGN_VERIFY },
      { sort: [["createdAt", "asc"]], tx }
    );

    return keys.filter(({ name }) => name.startsWith(OIDC_ISSUER_KEY_NAME_PREFIX));
  };

  // A Redis lock rather than an advisory lock, so no database connection is held while RSA keys are generated.
  const $rotateKeys = async (orgId: string, waitForLock: boolean) => {
    let lock: TKeyStoreLock;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.OidcIssuerKeyRotationLock(orgId)],
        KEY_ROTATION_LOCK_TTL_MS,
        waitForLock ? { retryCount: 20, retryDelay: 500 } : { retryCount: 0 }
      );
    } catch {
      return null;
    }

    try {
      // Read on the primary, which a transaction runs on: a lagging replica would hide a rotation that another
      // request just finished, and this one would rotate again
      const keys = await kmsDAL.transaction((tx) => $listKeys(orgId, tx));
      const { keysToCreate, keyIdsToDelete } = getKeyRotationPlan(keys);

      // Sequential, so createdAt orders the new keys
      for (let i = 0; i < keysToCreate; i += 1) {
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

      if (keyIdsToDelete.length) await kmsDAL.delete({ $in: { id: keyIdsToDelete } });
      if (keysToCreate) await keyStore.deleteItem(KeyStorePrefixes.OidcIssuerJwks(orgId));

      return keys.filter(({ id }) => !keyIdsToDelete.includes(id));
    } finally {
      try {
        await lock.release();
      } catch (err) {
        logger.warn(err, `OIDC issuer key rotation lock release failed [orgId=${orgId}]`);
      }
    }
  };

  const $getSigningKey = async (orgId: string) => {
    let keys = await $listKeys(orgId);

    if (getKeyRotationPlan(keys).keysToCreate) {
      // A busy lock means another request is already rotating and the current key is still valid, so only an
      // org with no key to sign with waits for it
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

    const [{ kid }, sign] = await Promise.all([
      kmsService.getPublicKey({ kmsId }).then(publicKeyToJwk),
      kmsService.signWithKmsKey({ kmsId })
    ]);

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
      sign: async (data) => {
        const { signature } = await sign({
          data,
          signingAlgorithm: SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
          isDigest: false
        });
        return signature;
      }
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

  // Cached so an anonymous caller cannot make every request decrypt keys. A stale set is harmless, because a key
  // is published a full signing period before it signs and was already out of use when it is deleted.
  const getJwks = async (orgId: string): Promise<TJwks> => {
    const cacheKey = KeyStorePrefixes.OidcIssuerJwks(orgId);
    const cached = await keyStore.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as TJwks;

    const keys = await $listKeys(orgId);

    const jwks = await Promise.all(
      keys.map(({ id }) =>
        kmsService
          .getPublicKey({ kmsId: id })
          .then(publicKeyToJwk)
          .catch((err) => {
            // A rotation can delete the oldest key after it was listed. That key stopped signing a full
            // period ago, so it is dropped rather than failing the whole set.
            if (err instanceof NotFoundError) return null;
            throw err;
          })
      )
    );

    const jwkSet = { keys: jwks.filter((jwk): jwk is NonNullable<typeof jwk> => jwk !== null) };

    // An empty set is never cached, or the first token signed for the org would be checked against it
    if (jwkSet.keys.length) {
      await keyStore.setItemWithExpiry(cacheKey, KeyStoreTtls.OidcIssuerJwksInSeconds, JSON.stringify(jwkSet));
    }

    return jwkSet;
  };

  return {
    signToken,
    getDiscoveryDocument,
    getJwks
  };
};
