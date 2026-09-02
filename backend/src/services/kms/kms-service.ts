import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";
import { z } from "zod";

import {
  KmsImportKeyMaterialTokensSchema,
  KmsKeysSchema,
  TKmsKeyImportMeta,
  TKmsKeys,
  TKmsRootConfig
} from "@app/db/schemas";
import { AwsKmsProviderFactory } from "@app/ee/services/external-kms/providers/aws-kms";
import { GcpKmsProviderFactory } from "@app/ee/services/external-kms/providers/gcp-kms";
import {
  ExternalKmsAwsSchema,
  ExternalKmsGcpSchema,
  KmsProviders,
  TExternalKmsProviderFns
} from "@app/ee/services/external-kms/providers/model";
import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { THsmStatus } from "@app/ee/services/hsm/hsm-types";
import { KeyStorePrefixes, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { isBase64 as isBase64String } from "@app/lib/base64";
import { withCache } from "@app/lib/cache/with-cache";
import { getOriginalConfig, TEnvConfig } from "@app/lib/config/env";
import { generateSecretValueBlindIndexFromKmsKey } from "@app/lib/crypto/blind-index";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { AllowedEncryptionKeyAlgorithms, ImportableEncryptionKeyAlgorithms } from "@app/lib/crypto/cipher/types";
import { crypto } from "@app/lib/crypto/cryptography";
import { HmacAlgorithm, hmacService } from "@app/lib/crypto/hmac";
import { setLegacyKeyMaterial, TLegacyKeyMaterial, TLegacyKeySnapshot } from "@app/lib/crypto/legacy-key";
import { detectPqcVariantFromDer } from "@app/lib/crypto/pqc/pqc-crypto";
import {
  AsymmetricKeyAlgorithm,
  getEcCurveName,
  isPqcKeyAlgorithm,
  KMS_TO_OPENSSL_NAME,
  signingService
} from "@app/lib/crypto/sign";
import { AsymmetricKeyAlgorithmEnum } from "@app/lib/crypto/sign/types";
import { delay } from "@app/lib/delay";
import { BadRequestError, ForbiddenRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  getByteLengthForSymmetricEncryptionAlgorithm,
  getKekLabel,
  KMS_LEGACY_ENCRYPTION_KEY_UUID,
  KMS_ROOT_CONFIG_UUID,
  MAX_HMAC_IMPORT_KEY_BYTE_LENGTH,
  MIN_HMAC_IMPORT_KEY_BYTE_LENGTH,
  resolveInstanceEncryptionKeyBuffer,
  verifyKeyTypeAndAlgorithm
} from "@app/services/kms/kms-fns";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TInternalKmsDALFactory } from "./internal-kms-dal";
import { TInternalKmsKeyVersionDALFactory } from "./internal-kms-key-version-dal";
import { TKmsImportKeyMaterialTokenDALFactory } from "./kms-import-key-material-token-dal";
import { TKmsKeyDALFactory } from "./kms-key-dal";
import { TKmsKeyImportMetaDALFactory } from "./kms-key-import-meta-dal";
import { TKmsKekHistoryDALFactory } from "./kms-kek-history-dal";
import { TKmsLegacyEncryptionKeyDALFactory } from "./kms-legacy-encryption-key-dal";
import { TKmsRootConfigDALFactory } from "./kms-root-config-dal";
import {
  KmsDataKey,
  KmsKeyStatus,
  KmsKeyUsage,
  KmsMaterialOrigin,
  KmsType,
  RootKeyEncryptionStrategy,
  TDecryptWithKeyDTO,
  TDecryptWithKmsDTO,
  TEncryptionWithKeyDTO,
  TEncryptWithKmsDataKeyDTO,
  TEncryptWithKmsDTO,
  TGenerateKMSDTO,
  TGenerateMacDTO,
  TGetBulkKeyMaterialDTO,
  TGetKeyMaterialDTO,
  TGetParamsForImportDTO,
  TGetPublicKeyDTO,
  TImportEncryptedKeyMaterialDTO,
  TImportKeyMaterialDTO,
  TSignWithKmsDTO,
  TUpdateProjectSecretManagerKmsKeyDTO,
  TVerifyMacDTO,
  TVerifyWithKmsDTO
} from "./kms-types";
import { TCmekKeyEncryptionAlgorithm } from "../cmek/cmek-types";
import {
  HYBRID_KEY_WRAP_ALGORITHMS,
  KeyWrapAlgorithm,
  OAEP_KEY_WRAP_ALGORITHMS
} from "@app/lib/crypto/cryptography/types";

type TKmsServiceFactoryDep = {
  kmsDAL: TKmsKeyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "updateById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById" | "transaction">;
  kmsRootConfigDAL: Pick<
    TKmsRootConfigDALFactory,
    | "findById"
    | "create"
    | "updateById"
    | "transaction"
    | "findAll"
    | "findStaged"
    | "findRetained"
    | "deleteAllStaged"
    | "deleteById"
  >;
  kmsLegacyEncryptionKeyDAL: Pick<TKmsLegacyEncryptionKeyDALFactory, "findById" | "create" | "transaction">;
  kmsKekHistoryDAL: Pick<
    TKmsKekHistoryDALFactory,
    "create" | "updateById" | "findHistoryPage" | "findActiveByLabel" | "findCurrent"
  >;
  internalKmsDAL: Pick<
    TInternalKmsDALFactory,
    "create" | "findByKmsKeyIdForUpdate" | "updateById" | "findOne"
  >;
  internalKmsKeyVersionDAL: Pick<
    TInternalKmsKeyVersionDALFactory,
    "create" | "find" | "findBeforeVersion" | "findOne" | "findLatestByInternalKmsId"
  >;
  kmsImportKeyMaterialTokenDAL: Pick<
    TKmsImportKeyMaterialTokenDALFactory,
    "create" | "findByIdForUpdate" | "updateById"
  >;
  kmsKeyImportMetaDAL: TKmsKeyImportMetaDALFactory;
  hsmService: THsmServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  envConfig: Pick<TEnvConfig, "ENCRYPTION_KEY" | "ROOT_ENCRYPTION_KEY">;
};

export type TKmsServiceFactory = ReturnType<typeof kmsServiceFactory>;

type TCachedProjectSmKmsMaterial = {
  kmsSecretManagerKeyId: string | null;
  kmsSecretManagerEncryptedDataKey: string | null;
  orgId: string;
};

// akhilmhdh: Don't edit this value. This is measured for blob concatination in kms
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
// v02 blobs additionally embed the key material version that encrypted them: [ciphertext][4-byte BE version]["v02"]
// Written only for keys with version > 1 so never-rotated keys keep producing byte-identical v01 blobs.
const KMS_VERSION_V2 = "v02";
const KMS_KEY_VERSION_BLOB_LENGTH = 4;
// AES-GCM output is at minimum a 12-byte IV + 16-byte auth tag (empty plaintext). A real v02 blob therefore
// cannot be shorter than this plus its 4-byte version + 3-byte suffix; anything shorter ending in "v02" is
// malformed/attacker input and must fall through to the legacy path rather than reading out of bounds.
const MIN_AES_GCM_BLOB_LENGTH = 12 + 16;
const MIN_V02_BLOB_LENGTH = MIN_AES_GCM_BLOB_LENGTH + KMS_KEY_VERSION_BLOB_LENGTH + KMS_VERSION_BLOB_LENGTH;
const KMS_PROJECT_SM_MATERIAL_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

// Single source of truth for the cipher-blob trailer so the encode side here and the decode side in
// decryptWithKmsKey can never drift: v1 keys get the legacy 3-byte "v01" suffix (byte-identical to pre-rotation
// output); rotated keys get [4-byte BE keyVersion]["v02"].
const buildKmsCipherTextBlob = (encryptedBlob: Buffer, keyVersion: number) => {
  if (keyVersion > 1) {
    const keyVersionBlob = Buffer.alloc(KMS_KEY_VERSION_BLOB_LENGTH);
    keyVersionBlob.writeUInt32BE(keyVersion, 0);
    return Buffer.concat([encryptedBlob, keyVersionBlob, Buffer.from(KMS_VERSION_V2, "utf8")]);
  }
  return Buffer.concat([encryptedBlob, Buffer.from(KMS_VERSION, "utf8")]);
};
const KmsSanitizedSchema = KmsKeysSchema.extend({ isExternal: z.boolean() });
const OPENSSL_TO_KMS: Record<string, string> = Object.fromEntries(
  Object.entries(KMS_TO_OPENSSL_NAME).map(([k, v]) => [v, k])
);

const MIN_RSA_PUBLIC_EXPONENT = 65537n;
const MAX_RSA_PUBLIC_EXPONENT = 1n << 256n;

export const kmsServiceFactory = ({
  envConfig,
  kmsDAL,
  kmsRootConfigDAL,
  kmsLegacyEncryptionKeyDAL,
  kmsKekHistoryDAL,
  internalKmsDAL,
  internalKmsKeyVersionDAL,
  kmsImportKeyMaterialTokenDAL,
  kmsKeyImportMetaDAL,
  orgDAL,
  projectDAL,
  hsmService,
  keyStore
}: TKmsServiceFactoryDep) => {
  let ROOT_ENCRYPTION_KEY: Buffer = Buffer.alloc(0);

  const validateKeyWrapAlgorithm = (keyAlgorithm: TCmekKeyEncryptionAlgorithm, wrapAlgorithm: KeyWrapAlgorithm) => {
    const supportsHybridKeyWrap =
      keyAlgorithm === AsymmetricKeyAlgorithm.ECC_NIST_P521 || keyAlgorithm === AsymmetricKeyAlgorithm.RSA_4096;
    const supportedAlgorithms = supportsHybridKeyWrap ? HYBRID_KEY_WRAP_ALGORITHMS : OAEP_KEY_WRAP_ALGORITHMS;

    if (!supportedAlgorithms.includes(wrapAlgorithm)) {
      throw new BadRequestError({
        message: `Wrapping algorithm '${wrapAlgorithm}' is not supported for key algorithm '${keyAlgorithm}'.`
      });
    }
  };

  const validateImportedKeyMaterial = async (
    key: Buffer,
    keyUsage: KmsKeyUsage,
    algorithm: TCmekKeyEncryptionAlgorithm
  ) => {
    if (!Buffer.isBuffer(key)) {
      throw new BadRequestError({ message: "Key material must be provided as binary data." });
    }

    verifyKeyTypeAndAlgorithm(keyUsage, algorithm);

    if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
      const expectedLength = getByteLengthForSymmetricEncryptionAlgorithm(algorithm as SymmetricKeyAlgorithm);
      if (key.length !== expectedLength) {
        throw new BadRequestError({
          message: `Invalid key material length for ${algorithm}. Expected ${expectedLength} bytes, got ${key.length}.`
        });
      }
      return;
    }

    if (keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
      if (key.length < MIN_HMAC_IMPORT_KEY_BYTE_LENGTH || key.length > MAX_HMAC_IMPORT_KEY_BYTE_LENGTH) {
        throw new BadRequestError({
          message: `Invalid HMAC key material length. Expected between ${MIN_HMAC_IMPORT_KEY_BYTE_LENGTH} and ${MAX_HMAC_IMPORT_KEY_BYTE_LENGTH} bytes, got ${key.length}.`
        });
      }
      return;
    }

    // The remaining importable key usages contain an asymmetric private key.
    const asymmetricAlgorithm = algorithm as AsymmetricKeyAlgorithm;
    let privateKey;
    try {
      privateKey = crypto.nativeCrypto.createPrivateKey({
        key,
        format: "der",
        type: "pkcs8"
      });
    } catch {
      throw new BadRequestError({
        message: "Invalid private key material. Expected a BER- or DER-encoded PKCS #8 private key."
      });
    }

    const isEcKey = [
      AsymmetricKeyAlgorithm.ECC_NIST_P256,
      AsymmetricKeyAlgorithm.ECC_NIST_P384,
      AsymmetricKeyAlgorithm.ECC_NIST_P521
    ].includes(asymmetricAlgorithm);

    const expectedCurve = isEcKey ? getEcCurveName(asymmetricAlgorithm).full : undefined;
    const keyDetails = privateKey.asymmetricKeyDetails;

    if (
      (asymmetricAlgorithm === AsymmetricKeyAlgorithm.RSA_4096 &&
        (privateKey.asymmetricKeyType !== "rsa" || keyDetails?.modulusLength !== 4096)) ||
      (expectedCurve && (privateKey.asymmetricKeyType !== "ec" || keyDetails?.namedCurve !== expectedCurve))
    ) {
      throw new BadRequestError({
        message: `Key material does not match the declared algorithm '${asymmetricAlgorithm}'.`
      });
    }

    /**
     * DSS standard Criteria for IFC Key Pairs section of FIPS PUB 186-5
     * Public exponent of RSA Keypair
     *     minimum valid exponent: 65537
     *     must be odd
     *     maximum must be less than 2^256
     */

    if (asymmetricAlgorithm === AsymmetricKeyAlgorithm.RSA_4096) {
      const publicExponent = keyDetails?.publicExponent;
      const isValidPublicExponent =
        typeof publicExponent === "bigint" &&
        publicExponent >= MIN_RSA_PUBLIC_EXPONENT &&
        publicExponent % 2n === 1n &&
        publicExponent < MAX_RSA_PUBLIC_EXPONENT;

      if (!isValidPublicExponent) {
        throw new BadRequestError({
          message: "RSA key public exponent must be odd, at least 65,537, and less than 2^256."
        });
      }
    }
  };

  /*
   * Generate KMS Key
   * This function is responsibile for generating the infisical internal KMS for various entities
   * Like for secret manager, cert manager or for organization
   */
  const generateKmsKey = async ({
    orgId,
    isReserved = true,
    isExportable = true,
    isImportable = false,
    importOnly = false,
    hasDeleteProtection = false,
    tx,
    name,
    projectId,
    encryptionAlgorithm = SymmetricKeyAlgorithm.AES_GCM_256,
    keyUsage = KmsKeyUsage.ENCRYPT_DECRYPT,
    description
  }: TGenerateKMSDTO) => {
    // daniel: ensure that the key type (sign/encrypt) and the encryption algorithm are compatible.
    verifyKeyTypeAndAlgorithm(keyUsage, encryptionAlgorithm);

    let encryptedKeyMaterial: Uint8Array | null = null;

    // form validations
    if (importOnly && !isImportable) {
      throw new BadRequestError({
        message: `ImportOnly can be set only for importable keys`
      });
    }

    if (isImportable && isExportable) {
      throw new BadRequestError({
        message: `Importable keys can't be exported`
      });
    }

    if (isImportable) {
      // validate supported algorithms for importable key type
      if (!ImportableEncryptionKeyAlgorithms.includes(encryptionAlgorithm)) {
        throw new BadRequestError({
          message: `Unsupported key algorithm for importable key type, using algorithm '${encryptionAlgorithm}'`
        });
      }
    } else {
      let kmsKeyMaterial: Buffer | null = null;
      if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
        kmsKeyMaterial = crypto.randomBytes(
          getByteLengthForSymmetricEncryptionAlgorithm(encryptionAlgorithm as SymmetricKeyAlgorithm)
        );
      } else if (keyUsage === KmsKeyUsage.SIGN_VERIFY) {
        const { generateAsymmetricPrivateKey, getPublicKeyFromPrivateKey } = signingService(
          encryptionAlgorithm as AsymmetricKeyAlgorithm
        );
        kmsKeyMaterial = await generateAsymmetricPrivateKey();

        // daniel: safety check to ensure we're able to extract the public key from the private key before we proceed to key creation
        await getPublicKeyFromPrivateKey(kmsKeyMaterial);
      } else if (keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
        kmsKeyMaterial = hmacService(encryptionAlgorithm as HmacAlgorithm).generateKeyMaterial();
      }

      if (!kmsKeyMaterial) {
        throw new BadRequestError({
          message: `Invalid KMS key type. No key material was created for key usage '${keyUsage}' using algorithm '${encryptionAlgorithm}'`
        });
      }

      const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
      encryptedKeyMaterial = cipher.encrypt(kmsKeyMaterial, ROOT_ENCRYPTION_KEY);
    }

    const sanitizedName = name ? slugify(name) : slugify(alphaNumericNanoId(8).toLowerCase());
    const dbQuery = async (db: Knex) => {
      const kmsDoc = await kmsDAL.create(
        {
          name: sanitizedName,
          keyUsage,
          orgId,
          isReserved,
          isImportable,
          importOnly,
          status: isImportable ? KmsKeyStatus.PendingImport : KmsKeyStatus.Enabled,
          isExportable,
          hasDeleteProtection,
          projectId,
          description
        },
        db
      );

      if (isImportable) {
        await kmsKeyImportMetaDAL.create(
          {
            encryptionAlgorithm,
            keyId: kmsDoc.id
          },
          db
        );
      } else {
        const internalKms = await internalKmsDAL.create(
          {
            version: 1,
            encryptedKey: Buffer.from(encryptedKeyMaterial!),
            encryptionAlgorithm,
            kmsKeyId: kmsDoc.id,
            origin: KmsMaterialOrigin.Internal
          },
          db
        );
        await internalKmsKeyVersionDAL.create(
          {
            internalKmsId: internalKms.id,
            encryptedKey: Buffer.from(encryptedKeyMaterial!),
            version: internalKms.version,
            origin: KmsMaterialOrigin.Internal
          },
          db
        );
      }

      return kmsDoc;
    };

    if (tx) return dbQuery(tx);
    const doc = await kmsDAL.transaction(async (tx2) => dbQuery(tx2));
    return doc;
  };

  const getParamsForImport = async ({
    kmsId,
    wrapKeyEncryptionAlgorithm,
    wrapSigningAlgorithm
  }: TGetParamsForImportDTO) => {
    if (wrapKeyEncryptionAlgorithm !== AsymmetricKeyAlgorithm.RSA_4096) {
      throw new BadRequestError({ message: "Only RSA_4096 wrapping keys are supported for key material import." });
    }

    if (!Object.values(KeyWrapAlgorithm).includes(wrapSigningAlgorithm)) {
      throw new BadRequestError({ message: `Unsupported key wrapping algorithm '${wrapSigningAlgorithm}'.` });
    }

    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    if (!kmsDoc.isImportable) {
      throw new BadRequestError({ message: `KMS with ID '${kmsId}' is not importable` });
    }
    if (kmsDoc.isDisabled) {
      throw new BadRequestError({ message: `KMS Key with ID '${kmsId}' is in disabled state` });
    }
    if (
      kmsDoc.status !== KmsKeyStatus.PendingImport &&
      kmsDoc.importEncryptionAlgorithm &&
      AsymmetricKeyAlgorithmEnum.includes(kmsDoc.importEncryptionAlgorithm)
    ) {
      throw new BadRequestError({
        message: `KMS Key with ID '${kmsId}' is asymmetric and not in 'pending_import' state `
      });
    }

    validateKeyWrapAlgorithm(kmsDoc.importEncryptionAlgorithm as TCmekKeyEncryptionAlgorithm, wrapSigningAlgorithm);

    let publicKey: string;
    let encryptedKey: Buffer;
    try {
      const signing = signingService(AsymmetricKeyAlgorithm.RSA_4096);
      const privateKey = await signing.generateAsymmetricPrivateKey();
      publicKey = crypto.nativeCrypto.createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString();
      encryptedKey = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256).encrypt(privateKey, ROOT_ENCRYPTION_KEY);
    } catch (error) {
      logger.error(error, `KMS: Failed to create import wrapping key for '${kmsId}'`);
      throw new InternalServerError({
        error,
        message: "Unable to create a wrapping key for key material import. Please try again."
      });
    }

    const importToken = KmsImportKeyMaterialTokensSchema.parse(
      await kmsImportKeyMaterialTokenDAL.create({
        keyId: kmsId,
        encryptedKey,
        // 1 day
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        wrapAlgorithm: wrapSigningAlgorithm,
        wrapKey: publicKey
      })
    );

    return { kmsId, publicKey, token: importToken.id };
  };

  const importWrappedKeyMaterial = async ({ wrappedKeyMaterial, kmsId, token }: TImportEncryptedKeyMaterialDTO) => {
    if (!isBase64String(wrappedKeyMaterial) || wrappedKeyMaterial.length === 0) {
      throw new BadRequestError({ message: "Encrypted key material must be a non-empty base64-encoded value." });
    }

    const validateKmsState = (kmsDoc: TKmsKeys, kmsImportMeta: TKmsKeyImportMeta) => {
      if (kmsDoc.isDisabled) {
        throw new BadRequestError({ message: `KMS Key with ID '${kmsId}' is in disabled state` });
      }
      // one time import restriction for asymmetric algorithms , as no rotation feature
      if (
        kmsDoc.status != KmsKeyStatus.PendingImport &&
        AsymmetricKeyAlgorithmEnum.includes(kmsImportMeta.encryptionAlgorithm)
      ) {
        throw new BadRequestError({
          message: `KMS Key with ID '${kmsId}' is asymmetric type and not in 'pending_import' status`
        });
      }
    };

    const wrappedKeyMaterialRaw = Buffer.from(wrappedKeyMaterial, "base64");

    return kmsDAL.transaction(async (tx) => {
      const importToken = await kmsImportKeyMaterialTokenDAL.findByIdForUpdate(token, tx);
      if (!importToken || importToken.keyId !== kmsId) {
        throw new NotFoundError({
          message: `Key material import token '${token}' not found for KMS with ID '${kmsId}'.`
        });
      }
      if (importToken.isUtilized) {
        throw new BadRequestError({ message: "This key material import token has already been used." });
      }
      if (new Date(importToken.expiresAt) <= new Date()) {
        throw new BadRequestError({
          message: "This key material import token has expired. Request a new wrapping key and try again."
        });
      }

      // Validate and unwrap before locking the KMS row so the write lock is held only for persistence.
      let kmsDoc = await kmsDAL.findById(kmsId, tx);
      if (!kmsDoc) throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
      const kmsImportMeta = await kmsKeyImportMetaDAL.findOne({ keyId: kmsId }, tx);

      validateKmsState(kmsDoc, kmsImportMeta);

      const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
      let importedKeyMaterial: Buffer;
      let privateKeyBuffer: Buffer;
      try {
        privateKeyBuffer = cipher.decrypt(importToken.encryptedKey, ROOT_ENCRYPTION_KEY);
      } catch (error) {
        logger.error(error, `KMS: Failed to decrypt import token for '${kmsId}'`);
        throw new InternalServerError({
          error,
          message: "Unable to process this import token. Request a new wrapping key and try again."
        });
      }
      try {
        importedKeyMaterial = crypto
          .encryption()
          .wrapKeys()
          .decrypt(wrappedKeyMaterialRaw, privateKeyBuffer.toString(), importToken.wrapAlgorithm as KeyWrapAlgorithm);
      } catch (error) {
        logger.error(error, `KMS: Failed to unwrap imported key material for '${kmsId}'`);
        throw new BadRequestError({
          message: "Unable to unwrap the key material. Verify that it was wrapped with the selected wrapping algorithm."
        });
      } finally {
        // The wrapping private key is temporary; do not retain it in memory after use.
        privateKeyBuffer.fill(0);
      }

      // Reject material that does not match the target key's declared usage and algorithm before persisting it.
      await validateImportedKeyMaterial(
        importedKeyMaterial,
        kmsDoc.keyUsage as KmsKeyUsage,
        kmsImportMeta.encryptionAlgorithm as TCmekKeyEncryptionAlgorithm
      );

      const encryptedImportedKeyMaterial = cipher.encrypt(importedKeyMaterial, ROOT_ENCRYPTION_KEY);

      // acquired lock over kmskey
      const lockedKmsDoc = await kmsDAL.findByIdForUpdate(kmsId, tx);
      if (!lockedKmsDoc) {
        throw new NotFoundError({ message: `KMS Key with ID '${kmsId}' not found` });
      }
      kmsDoc = lockedKmsDoc;
      validateKmsState(kmsDoc, kmsImportMeta);

      let internalKms = await internalKmsDAL.findOne({ kmsKeyId: kmsId }, tx);
      // first import operation
      if (!internalKms) {
        // db level unqiue index locks are applicable
        internalKms = await internalKmsDAL.create(
          {
            version: 1,
            encryptedKey: encryptedImportedKeyMaterial,
            encryptionAlgorithm: kmsImportMeta.encryptionAlgorithm,
            kmsKeyId: kmsDoc.id,
            origin: KmsMaterialOrigin.Imported
          },
          tx
        );
        const internalKmsKeyVersion = await internalKmsKeyVersionDAL.create(
          {
            internalKmsId: internalKms.id,
            encryptedKey: encryptedImportedKeyMaterial,
            version: internalKms.version,
            origin: KmsMaterialOrigin.Imported
          },
          tx
        );
        await kmsDAL.updateById(kmsId, { status: "enabled" }, tx);
        await kmsImportKeyMaterialTokenDAL.updateById(importToken.id, { isUtilized: true }, tx);
        return {
          kmsKeyVersionId: internalKmsKeyVersion.id,
          keyId: kmsId,
          keyVersion: 1,
          wrappingAlgorithm: importToken.wrapAlgorithm as KeyWrapAlgorithm
        };
      }

      const internalKmsVersion = await internalKmsKeyVersionDAL.findLatestByInternalKmsId(internalKms.id, tx);
      if (!internalKmsVersion) {
        logger.error({ internalKmsId: internalKms.id, kmsId }, "KMS: Latest imported key version is missing");
        throw new InternalServerError({
          message: "KMS key material is unavailable. Contact support if the problem persists."
        });
      }

      // utilized for future rotations ,
      // user performs manual rotation to advance active version
      const internalKmsKeyVersion = await internalKmsKeyVersionDAL.create(
        {
          internalKmsId: internalKms.id,
          encryptedKey: encryptedImportedKeyMaterial,
          version: internalKmsVersion.version + 1,
          origin: KmsMaterialOrigin.Imported
        },
        tx
      );
      await kmsImportKeyMaterialTokenDAL.updateById(importToken.id, { isUtilized: true }, tx);

      return {
        kmsKeyVersionId: internalKmsKeyVersion.id,
        keyVersion: internalKmsVersion.version + 1,
        keyId: kmsId,
        wrappingAlgorithm: importToken.wrapAlgorithm as KeyWrapAlgorithm
      };
    });
  };

  /*
   * Rotate KMS Key
   * Advances the key material in version table , generates a new material when old material isn't found
   * Old material is never deleted so existing ciphertexts stay decryptable.
   */
  const rotateKmsKey = async (kmsKeyId: string, tx?: Knex) => {
    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    const dbQuery = async (db: Knex) => {
      const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId, db);
      if (!kmsDoc) {
        throw new NotFoundError({ message: `KMS with ID '${kmsKeyId}' not found` });
      }

      if (kmsDoc.externalKms) {
        throw new BadRequestError({
          message: "Cannot rotate external KMS keys from Infisical. Rotate the key in your external provider instead."
        });
      }

      if (kmsDoc.isReserved) {
        throw new BadRequestError({ message: "Reserved Infisical-managed KMS keys cannot be rotated." });
      }

      if (kmsDoc.isDisabled) {
        throw new BadRequestError({ message: "Key is disabled" });
      }

      if ((kmsDoc.keyUsage as KmsKeyUsage) !== KmsKeyUsage.ENCRYPT_DECRYPT) {
        throw new BadRequestError({
          message:
            "Only encrypt-decrypt keys support rotation. To rotate a sign-verify or MAC key, create a new key and update your applications to use it."
        });
      }

      const internalKms = await internalKmsDAL.findByKmsKeyIdForUpdate(kmsKeyId, db);

      if (!internalKms && kmsDoc.status === KmsKeyStatus.PendingImport) {
        throw new BadRequestError({
          message: "Importable Kms key should be importated before performing rotation"
        });
      }

      // importOnly
      // make the future versions , but not active and then
      if (!internalKms) {
        throw new NotFoundError({ message: `Internal KMS not found for KMS with ID '${kmsKeyId}'` });
      }

      // Retrieve a previously imported key with advanced version, for importable symmetric keys
      if (kmsDoc.isImportable) {
        const nextKmsKey = await internalKmsKeyVersionDAL.findOne(
          {
            internalKmsId: internalKms.id,
            version: internalKms.version + 1
          },
          db
        );

        if (nextKmsKey) {
          const updatedInternalKms = await internalKmsDAL.updateById(
            internalKms.id,
            {
              encryptedKey: nextKmsKey.encryptedKey,
              version: nextKmsKey.version,
              origin: nextKmsKey.origin
            },
            db
          );
          return { id: kmsDoc.id, version: updatedInternalKms.version };
        }
      }
      if (kmsDoc.importOnly) {
        throw new NotFoundError({
          message: `Imported Key Material with advanced version not found for '${kmsKeyId}' importOnly keys dont generate key material`
        });
      }

      const encryptionAlgorithm = internalKms.encryptionAlgorithm as SymmetricKeyAlgorithm;
      const newKeyMaterial = crypto.randomBytes(getByteLengthForSymmetricEncryptionAlgorithm(encryptionAlgorithm));
      const encryptedNewKeyMaterial = keyCipher.encrypt(newKeyMaterial, ROOT_ENCRYPTION_KEY);

      const payload = {
        encryptedKey: encryptedNewKeyMaterial,
        version: internalKms.version + 1,
        origin: KmsMaterialOrigin.Internal
      };

      const updatedInternalKms = await internalKmsDAL.updateById(internalKms.id, payload, db);
      await internalKmsKeyVersionDAL.create(
        {
          internalKmsId: internalKms.id,
          ...payload
        },
        db
      );

      return { id: kmsDoc.id, version: updatedInternalKms.version };
    };

    return tx ? dbQuery(tx) : kmsDAL.transaction(dbQuery);
  };

  const deleteInternalKms = async (kmsId: string, orgId: string, tx?: Knex) => {
    const kms = await kmsDAL.findByIdWithAssociatedKms(kmsId, tx);
    if (!kms) return;
    if (kms.isExternal) return;
    if (kms.orgId !== orgId) throw new ForbiddenRequestError({ message: "KMS doesn't belong to organization" });
    return kmsDAL.deleteById(kmsId, tx);
  };

  /*
   * Simple encryption service function to do all the encryption tasks in infisical
   * This can be even later exposed directly as api for encryption as function
   * The encrypted binary even has everything into it. The IV, the version etc
   */
  const encryptWithInputKey = async ({ key }: Omit<TEncryptionWithKeyDTO, "plainText">) => {
    // akhilmhdh: as more encryption are added do a check here on kmsDoc.encryptionAlgorithm
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    return ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
      const encryptedPlainTextBlob = cipher.encrypt(plainText, key);
      // Buffer#1 encrypted text + Buffer#2 version number
      const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
      const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);
      return { cipherTextBlob };
    };
  };

  /*
   * Simple decryption service function to do all the encryption tasks in infisical
   * This can be even later exposed directly as api for encryption as function
   */
  const decryptWithInputKey = async ({ key }: Omit<TDecryptWithKeyDTO, "cipherTextBlob">) => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    return ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKeyDTO, "cipherTextBlob">) => {
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decryptedBlob = cipher.decrypt(cipherTextBlob, key);
      return decryptedBlob;
    };
  };

  /*
   * Function to generate a KMS for an org
   * We handle concurrent with redis locking and waitReady
   * What happens is first we check kms is assigned else first we acquire lock and create the kms with connection
   * In mean time the rest of the request will wait until creation is finished followed by getting the created on
   * In real time this would be milliseconds
   */
  // Helper function to create org KMS key within a transaction
  const $createOrgKmsKey = async (orgId: string, tx: Knex) => {
    const org = await orgDAL.findById(orgId, tx);
    if (org.kmsDefaultKeyId) {
      return org.kmsDefaultKeyId;
    }

    const key = await generateKmsKey({
      isReserved: true,
      orgId: org.id,
      tx
    });

    await orgDAL.updateById(
      org.id,
      {
        kmsDefaultKeyId: key.id
      },
      tx
    );

    return key.id;
  };

  const getOrgKmsKeyId = async (orgId: string, trx?: Knex) => {
    const org = await orgDAL.findById(orgId, trx);

    if (!org) {
      throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    if (!org.kmsDefaultKeyId) {
      if (trx) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsOrgKeyCreation(orgId)]);
        return $createOrgKmsKey(orgId, trx);
      }

      const keyId = await orgDAL.transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsOrgKeyCreation(orgId)]);
        return $createOrgKmsKey(orgId, tx);
      });

      return keyId;
    }

    return org.kmsDefaultKeyId;
  };

  const encryptWithRootKey = () => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    return (plainTextBuffer: Buffer) => {
      const encryptedBuffer = cipher.encrypt(plainTextBuffer, ROOT_ENCRYPTION_KEY);
      return encryptedBuffer;
    };
  };

  const decryptWithRootKey = () => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    return (cipherTextBuffer: Buffer) => {
      return cipher.decrypt(cipherTextBuffer, ROOT_ENCRYPTION_KEY);
    };
  };

  const decryptWithKmsKey = async ({
    kmsId,
    depth = 0,
    tx
  }: Omit<TDecryptWithKmsDTO, "cipherTextBlob"> & { depth?: number; tx?: Knex }) => {
    if (depth > 2) throw new BadRequestError({ message: "KMS depth max limit" });

    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId, tx);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    if (kmsDoc.externalKms) {
      let externalKms: TExternalKmsProviderFns;

      if (!kmsDoc.orgKms.id || !kmsDoc.orgKms.encryptedDataKey) {
        throw new BadRequestError({ message: "Invalid organization KMS" });
      }

      // The idea is external kms connection info is encrypted by an org default KMS
      // This could be external kms(in future) but at the end of the day, the end KMS will be an infisical internal one
      // we put a limit of depth to avoid too many cycles
      const orgKmsDecryptor = await decryptWithKmsKey({
        kmsId: kmsDoc.orgKms.id,
        depth: depth + 1,
        tx
      });

      const orgKmsDataKey = await orgKmsDecryptor({
        cipherTextBlob: kmsDoc.orgKms.encryptedDataKey
      });
      if (!orgKmsDataKey) {
        logger.error({ kmsId }, "KMS: Failed to decrypt organization KMS key");
        throw new InternalServerError({ message: "Unable to decrypt the organization KMS key. Please try again." });
      }

      const kmsDecryptor = await decryptWithInputKey({
        key: orgKmsDataKey
      });

      if (!kmsDoc.externalKms.encryptedProviderInput) {
        throw new BadRequestError({ message: "External KMS configuration is incomplete." });
      }

      const decryptedProviderInputBlob = kmsDecryptor({
        cipherTextBlob: kmsDoc.externalKms.encryptedProviderInput
      });

      switch (kmsDoc.externalKms.provider) {
        case KmsProviders.Aws: {
          const decryptedProviderInput = await ExternalKmsAwsSchema.parseAsync(
            JSON.parse(decryptedProviderInputBlob.toString("utf8"))
          );

          externalKms = await AwsKmsProviderFactory({
            inputs: decryptedProviderInput
          });
          break;
        }
        case KmsProviders.Gcp: {
          const decryptedProviderInput = await ExternalKmsGcpSchema.parseAsync(
            JSON.parse(decryptedProviderInputBlob.toString("utf8"))
          );

          externalKms = await GcpKmsProviderFactory({
            inputs: decryptedProviderInput
          });
          break;
        }
        default:
          throw new BadRequestError({ message: "Invalid KMS provider." });
      }

      return async ({ cipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
        try {
          const { data } = await externalKms.decrypt(cipherTextBlob);
          return data;
        } finally {
          await externalKms.cleanup();
        }
      };
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as SymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.ENCRYPT_DECRYPT
    });
    // internal KMS

    if (kmsDoc.status === KmsKeyStatus.PendingImport) {
      throw new InternalServerError({
        message: "Kms key hasn't imported key material yet"
      });
    }

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const dataCipher = symmetricCipherService(encryptionAlgorithm);
    const internalKmsId = kmsDoc.internalKms?.id as string;
    const currentKeyVersion = kmsDoc.internalKms?.version as number; // NOT NULL, defaults to 1
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    const keyMaterialByVersion = new Map<number, Buffer>([[currentKeyVersion, kmsKey]]);
    let archivedVersionsLoaded = false;
    const $loadArchivedVersions = async () => {
      if (archivedVersionsLoaded) return;
      // one query for all archived versions; DB errors propagate (never silently treated as a decrypt failure)
      const archivedVersions = await internalKmsKeyVersionDAL.findBeforeVersion(internalKmsId, currentKeyVersion, tx);
      for (const archived of archivedVersions) {
        if (!keyMaterialByVersion.has(archived.version)) {
          keyMaterialByVersion.set(archived.version, keyCipher.decrypt(archived.encryptedKey, ROOT_ENCRYPTION_KEY));
        }
      }
      archivedVersionsLoaded = true;
    };

    // Try the preferred version first (cheap, no DB), then the current material, then every archived version
    // newest-first. Returns the plaintext, or null if no available material authenticates the blob. Trying the
    // current material covers the export/import case where rotated material was re-imported as version 1, and
    // trying older material covers stale-replica writers that used pre-rotation material.
    const $tryDecryptWithAnyMaterial = async (cipherTextBlob: Buffer, preferredVersion: number) => {
      const attempt = (material?: Buffer) => {
        if (!material) return null;
        try {
          return dataCipher.decrypt(cipherTextBlob, material);
        } catch {
          return null; // GCM auth failure for this material; try the next candidate
        }
      };

      const preferred = attempt(keyMaterialByVersion.get(preferredVersion));
      if (preferred) return preferred;

      // skip when preferred already was the current material (seeded under currentKeyVersion)
      if (preferredVersion !== currentKeyVersion) {
        const current = attempt(kmsKey);
        if (current) return current;
      }

      await $loadArchivedVersions();
      for (let version = currentKeyVersion - 1; version >= 1; version -= 1) {
        const decrypted = attempt(keyMaterialByVersion.get(version));
        if (decrypted) return decrypted;
      }
      return null;
    };

    return async ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
      const suffix =
        versionedCipherTextBlob.length >= KMS_VERSION_BLOB_LENGTH
          ? versionedCipherTextBlob.subarray(-KMS_VERSION_BLOB_LENGTH).toString("utf8")
          : "";

      // v02 is recognized structurally (suffix + minimum length), never by trusting the embedded version: a blob
      // too short to be real AES-GCM output that happens to end in "v02" is treated as legacy/garbage and falls
      // through, so readUInt32BE can never run on a negative offset.
      if (suffix === KMS_VERSION_V2 && versionedCipherTextBlob.length >= MIN_V02_BLOB_LENGTH) {
        const keyVersionOffset = versionedCipherTextBlob.length - KMS_VERSION_BLOB_LENGTH - KMS_KEY_VERSION_BLOB_LENGTH;
        const embeddedVersion = versionedCipherTextBlob.readUInt32BE(keyVersionOffset);
        const cipherTextBlob = versionedCipherTextBlob.subarray(0, keyVersionOffset);

        const decrypted = await $tryDecryptWithAnyMaterial(cipherTextBlob, embeddedVersion);
        if (decrypted) return decrypted;

        return dataCipher.decrypt(cipherTextBlob, kmsKey);
      }

      // legacy v01 (or anything not validated as v02): strip the 3-byte suffix and try all available material
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decrypted = await $tryDecryptWithAnyMaterial(cipherTextBlob, currentKeyVersion);
      if (decrypted) return decrypted;
      return dataCipher.decrypt(cipherTextBlob, kmsKey);
    };
  };

  const getKeyMaterial = async ({ kmsId }: TGetKeyMaterialDTO) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    if (kmsDoc.isReserved) {
      throw new BadRequestError({
        message: "Cannot get key material for reserved key"
      });
    }

    if (kmsDoc.externalKms) {
      throw new BadRequestError({
        message: "Cannot get key material for external key"
      });
    }

    if (!kmsDoc.isExportable) {
      throw new BadRequestError({
        message: "You are not allowed to export this key"
      });
    }
    if (kmsDoc.status == KmsKeyStatus.PendingImport) {
      throw new InternalServerError({
        message: "Kms key hasn't imported key material yet"
      });
    }

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return kmsKey;
  };

  const getBulkKeyMaterial = async ({ kmsIds }: TGetBulkKeyMaterialDTO) => {
    const kmsDocs = await kmsDAL.findByIdsWithAssociatedKms(kmsIds);

    return kmsDocs.map((kmsDoc) => {
      if (kmsDoc.isReserved) {
        throw new BadRequestError({ message: `Cannot get key material for reserved key [kmsId=${kmsDoc.id}]` });
      }
      if (kmsDoc.externalKms) {
        throw new BadRequestError({ message: `Cannot get key material for external key [kmsId=${kmsDoc.id}]` });
      }
      if (!kmsDoc.isExportable) {
        throw new BadRequestError({ message: `You are not allowed to export this key [kmsId=${kmsDoc.id}]` });
      }
      // Imported Key Materials are not exportable , add a gate to check for status==PendingImport when opting into exports

      const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
      const keyMaterial = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

      return { kmsId: kmsDoc.id, name: kmsDoc.name, keyMaterial };
    });
  };

  const importKeyMaterial = async (
    {
      key,
      algorithm,
      name,
      isReserved,
      isExportable = true,
      hasDeleteProtection = false,
      projectId,
      orgId,
      keyUsage,
      kmipMetadata
    }: TImportKeyMaterialDTO,
    tx?: Knex
  ) => {
    verifyKeyTypeAndAlgorithm(keyUsage, algorithm);

    if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
      const expectedLength = getByteLengthForSymmetricEncryptionAlgorithm(algorithm as SymmetricKeyAlgorithm);
      if (key.length !== expectedLength) {
        throw new BadRequestError({
          message: `Invalid key material length for ${algorithm}. Expected ${expectedLength} bytes, got ${key.length}.`
        });
      }
    }

    if (keyUsage === KmsKeyUsage.SIGN_VERIFY) {
      const { getPublicKeyFromPrivateKey } = signingService(algorithm as AsymmetricKeyAlgorithm);
      try {
        await getPublicKeyFromPrivateKey(key);
      } catch {
        const expectedFormat = isPqcKeyAlgorithm(algorithm as string) ? "PKCS8 DER-encoded" : "PKCS8 PEM-encoded";
        throw new BadRequestError({
          message: `Invalid private key material. Expected a ${expectedFormat} private key.`
        });
      }

      if (isPqcKeyAlgorithm(algorithm as string)) {
        const detectedVariant = detectPqcVariantFromDer(key);
        const expectedVariant = KMS_TO_OPENSSL_NAME[algorithm as AsymmetricKeyAlgorithm];
        if (detectedVariant && expectedVariant && detectedVariant !== expectedVariant) {
          throw new BadRequestError({
            message: `Key material does not match the declared algorithm. Expected ${algorithm as string} but the key is ${OPENSSL_TO_KMS[detectedVariant] || detectedVariant}.`
          });
        }
      } else {
        const keyObj = crypto.nativeCrypto.createPrivateKey({
          key,
          format: "pem",
          type: "pkcs8"
        });
        const keyType = keyObj.asymmetricKeyType;
        const keyDetails = keyObj.asymmetricKeyDetails;

        if (algorithm === AsymmetricKeyAlgorithm.RSA_4096) {
          if (keyType !== "rsa" || keyDetails?.modulusLength !== 4096) {
            throw new BadRequestError({
              message: `Key material does not match the declared algorithm. Expected an RSA 4096-bit key.`
            });
          }
        } else if (algorithm === AsymmetricKeyAlgorithm.ECC_NIST_P256) {
          if (keyType !== "ec" || keyDetails?.namedCurve !== "prime256v1") {
            throw new BadRequestError({
              message: `Key material does not match the declared algorithm. Expected an EC P-256 key.`
            });
          }
        }
      }
    }

    if (keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
      if (key.length < MIN_HMAC_IMPORT_KEY_BYTE_LENGTH || key.length > MAX_HMAC_IMPORT_KEY_BYTE_LENGTH) {
        throw new BadRequestError({
          message: `Invalid HMAC key material length. Expected between ${MIN_HMAC_IMPORT_KEY_BYTE_LENGTH} and ${MAX_HMAC_IMPORT_KEY_BYTE_LENGTH} bytes, got ${key.length}.`
        });
      }
    }

    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    const encryptedKeyMaterial = cipher.encrypt(key, ROOT_ENCRYPTION_KEY);
    const sanitizedName = name ? slugify(name) : slugify(alphaNumericNanoId(8).toLowerCase());
    const dbQuery = async (db: Knex) => {
      const kmsDoc = await kmsDAL.create(
        {
          name: sanitizedName,
          keyUsage,
          orgId,
          isReserved,
          isExportable,
          hasDeleteProtection,
          projectId,
          kmipMetadata
        },
        db
      );

      const internalKms = await internalKmsDAL.create(
        {
          version: 1,
          encryptedKey: encryptedKeyMaterial,
          encryptionAlgorithm: algorithm,
          kmsKeyId: kmsDoc.id,
          origin: KmsMaterialOrigin.Imported
        },
        db
      );

      await internalKmsKeyVersionDAL.create(
        {
          internalKmsId: internalKms.id,
          encryptedKey: encryptedKeyMaterial,
          version: 1,
          origin: KmsMaterialOrigin.Imported
        },
        db
      );

      return kmsDoc;
    };
    if (tx) return dbQuery(tx);
    const doc = await kmsDAL.transaction(async (tx2) => dbQuery(tx2));
    return doc;
  };

  const getPublicKey = async ({ kmsId }: TGetPublicKeyDTO) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }
    if (kmsDoc.status === KmsKeyStatus.PendingImport) {
      throw new InternalServerError({
        message: "Kms key hasn't imported key material yet"
      });
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as AsymmetricKeyAlgorithm;

    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return signingService(encryptionAlgorithm).getPublicKeyFromPrivateKey(kmsKey);
  };

  const signWithKmsKey = async ({ kmsId }: Pick<TSignWithKmsDTO, "kmsId">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as AsymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const { sign } = signingService(encryptionAlgorithm);
    return async ({
      data,
      signingAlgorithm,
      isDigest
    }: Pick<TSignWithKmsDTO, "data" | "signingAlgorithm" | "isDigest">) => {
      const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);
      const signature = await sign(data, kmsKey, signingAlgorithm, isDigest);

      return Promise.resolve({ signature, algorithm: signingAlgorithm });
    };
  };

  const verifyWithKmsKey = async ({
    kmsId,
    signingAlgorithm
  }: Pick<TVerifyWithKmsDTO, "kmsId" | "signingAlgorithm">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }
    if (kmsDoc.status === KmsKeyStatus.PendingImport) {
      throw new InternalServerError({
        message: "Kms key hasn't imported key material yet"
      });
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as AsymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const { verify, getPublicKeyFromPrivateKey } = signingService(encryptionAlgorithm);
    return async ({ data, signature, isDigest }: Pick<TVerifyWithKmsDTO, "data" | "signature" | "isDigest">) => {
      const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

      const publicKey = await getPublicKeyFromPrivateKey(kmsKey);
      const signatureValid = await verify(data, signature, publicKey, signingAlgorithm, isDigest);
      return Promise.resolve({ signatureValid, algorithm: signingAlgorithm });
    };
  };

  const generateMac = async ({ kmsId }: Pick<TGenerateMacDTO, "kmsId">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }
    if (kmsDoc.status === KmsKeyStatus.PendingImport) {
      throw new InternalServerError({
        message: "Kms key hasn't imported key material yet"
      });
    }

    const macAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as HmacAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, macAlgorithm, {
      forceType: KmsKeyUsage.GENERATE_VERIFY_MAC
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const { generateMac: generate } = hmacService(macAlgorithm);
    return ({ data }: Pick<TGenerateMacDTO, "data">) => {
      const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);
      const mac = generate(data, kmsKey);
      return { mac, algorithm: macAlgorithm };
    };
  };

  const verifyMac = async ({ kmsId }: Pick<TVerifyMacDTO, "kmsId">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }
    if (kmsDoc.status === KmsKeyStatus.PendingImport) {
      throw new InternalServerError({
        message: "Kms key hasn't imported key material yet"
      });
    }

    const macAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as HmacAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, macAlgorithm, {
      forceType: KmsKeyUsage.GENERATE_VERIFY_MAC
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const { verifyMac: verify } = hmacService(macAlgorithm);
    return ({ data, mac }: Pick<TVerifyMacDTO, "data" | "mac">) => {
      const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);
      const macValid = verify(data, mac, kmsKey);
      return { macValid, algorithm: macAlgorithm };
    };
  };

  const encryptWithKmsKey = async ({ kmsId }: Omit<TEncryptWithKmsDTO, "plainText">, tx?: Knex) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId, tx);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    if (kmsDoc.externalKms) {
      let externalKms: TExternalKmsProviderFns;
      if (!kmsDoc.orgKms.id || !kmsDoc.orgKms.encryptedDataKey) {
        throw new BadRequestError({ message: "Invalid organization KMS" });
      }

      const orgKmsDecryptor = await decryptWithKmsKey({
        kmsId: kmsDoc.orgKms.id,
        tx
      });

      const orgKmsDataKey = await orgKmsDecryptor({
        cipherTextBlob: kmsDoc.orgKms.encryptedDataKey
      });
      if (!orgKmsDataKey) {
        logger.error({ kmsId }, "KMS: Failed to decrypt organization KMS key");
        throw new InternalServerError({ message: "Unable to decrypt the organization KMS key. Please try again." });
      }

      const kmsDecryptor = await decryptWithInputKey({
        key: orgKmsDataKey
      });

      if (!kmsDoc.externalKms.encryptedProviderInput) {
        throw new BadRequestError({ message: "External KMS configuration is incomplete." });
      }

      const decryptedProviderInputBlob = kmsDecryptor({
        cipherTextBlob: kmsDoc.externalKms.encryptedProviderInput
      });

      switch (kmsDoc.externalKms.provider) {
        case KmsProviders.Aws: {
          const decryptedProviderInput = await ExternalKmsAwsSchema.parseAsync(
            JSON.parse(decryptedProviderInputBlob.toString("utf8"))
          );

          externalKms = await AwsKmsProviderFactory({
            inputs: decryptedProviderInput
          });
          break;
        }
        case KmsProviders.Gcp: {
          const decryptedProviderInput = await ExternalKmsGcpSchema.parseAsync(
            JSON.parse(decryptedProviderInputBlob.toString("utf8"))
          );

          externalKms = await GcpKmsProviderFactory({
            inputs: decryptedProviderInput
          });
          break;
        }
        default:
          throw new BadRequestError({ message: "Invalid KMS provider." });
      }

      return async ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
        try {
          const { encryptedBlob } = await externalKms.encrypt(plainText);
          return { cipherTextBlob: encryptedBlob };
        } finally {
          await externalKms.cleanup();
        }
      };
    }
    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as SymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.ENCRYPT_DECRYPT
    });

    // internal KMS
    if (kmsDoc.status === KmsKeyStatus.PendingImport) {
      throw new InternalServerError({
        message: "Kms key hasn't imported key material yet"
      });
    }

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const dataCipher = symmetricCipherService(encryptionAlgorithm);
    const currentKeyVersion = kmsDoc.internalKms?.version as number; // NOT NULL, defaults to 1
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
      const encryptedPlainTextBlob = dataCipher.encrypt(plainText, kmsKey);
      const cipherTextBlob = buildKmsCipherTextBlob(encryptedPlainTextBlob, currentKeyVersion);
      return Promise.resolve({ cipherTextBlob });
    };
  };

  // Helper function to create org data key within a transaction
  const $createOrgKmsDataKey = async (orgId: string, kmsKeyId: string, tx: Knex) => {
    const org = await orgDAL.findById(orgId, tx);
    if (org.kmsEncryptedDataKey) {
      return;
    }

    const dataKey = crypto.randomBytes(32);
    const kmsEncryptor = await encryptWithKmsKey({ kmsId: kmsKeyId }, tx);
    const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });

    await orgDAL.updateById(org.id, { kmsEncryptedDataKey: cipherTextBlob }, tx);

    return dataKey;
  };

  const $getOrgKmsDataKey = async (orgId: string, trx?: Knex) => {
    const kmsKeyId = await getOrgKmsKeyId(orgId, trx);
    let org = await orgDAL.findById(orgId, trx);

    if (!org) {
      throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    if (!org.kmsEncryptedDataKey) {
      let orgDataKey: Buffer | undefined;

      if (trx) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsOrgDataKeyCreation(orgId)]);
        orgDataKey = await $createOrgKmsDataKey(orgId, kmsKeyId, trx);
      } else {
        orgDataKey = await orgDAL.transaction(async (tx) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsOrgDataKeyCreation(orgId)]);
          return $createOrgKmsDataKey(orgId, kmsKeyId, tx);
        });
      }

      if (orgDataKey) {
        return orgDataKey;
      }

      org = await orgDAL.findById(orgId, trx);
    }

    if (!org.kmsEncryptedDataKey) {
      throw new BadRequestError({ message: "Invalid organization KMS" });
    }

    const kmsDecryptor = await decryptWithKmsKey({
      kmsId: kmsKeyId,
      tx: trx
    });

    return kmsDecryptor({
      cipherTextBlob: org.kmsEncryptedDataKey
    });
  };

  // Helper function to create project KMS key within a transaction
  const $createProjectKmsKey = async (projectId: string, tx: Knex) => {
    const project = await projectDAL.findById(projectId, tx);
    if (project.kmsSecretManagerKeyId) {
      return project.kmsSecretManagerKeyId;
    }

    const key = await generateKmsKey({
      isReserved: true,
      orgId: project.orgId,
      tx
    });

    await projectDAL.updateById(projectId, { kmsSecretManagerKeyId: key.id }, tx);

    return key.id;
  };

  // Drops the cached KMS material for a project. Call after the writing transaction commits. Retries transient
  // Redis failures; a final failure is safe to swallow: stale entries either degrade gracefully (creation,
  // backup restore) or are recovered by the NotFound self-heal in $getProjectSecretManagerKmsDataKey (rotation).
  const $invalidateProjectSecretManagerKmsMaterialCache = async (projectId: string) => {
    const cacheKey = KeyStorePrefixes.KmsProjectSecretManagerMaterial(projectId);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await keyStore.deleteItem(cacheKey);
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          logger.error(
            { err, projectId },
            `Failed to invalidate project KMS material cache after ${maxAttempts} attempts; stale reads self-heal on decrypt [projectId=${projectId}]`
          );
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        await delay(100 * attempt);
      }
    }
  };

  // Opportunistic cache repair for fresh (skipCache) readers: if a cached entry exists and disagrees with the
  // project row just read from the DB, drop it so cached readers converge before the TTL expires.
  const $repairProjectSecretManagerKmsMaterialCache = async (
    projectId: string,
    fresh: { kmsSecretManagerKeyId?: string | null; kmsSecretManagerEncryptedDataKey?: Buffer | null }
  ) => {
    try {
      const raw = await keyStore.getItem(KeyStorePrefixes.KmsProjectSecretManagerMaterial(projectId));
      if (!raw) return;
      const cached = JSON.parse(raw) as TCachedProjectSmKmsMaterial;
      const freshEncryptedDataKey = fresh.kmsSecretManagerEncryptedDataKey
        ? Buffer.from(fresh.kmsSecretManagerEncryptedDataKey).toString("base64")
        : null;
      if (
        cached.kmsSecretManagerKeyId === (fresh.kmsSecretManagerKeyId ?? null) &&
        cached.kmsSecretManagerEncryptedDataKey === freshEncryptedDataKey
      ) {
        return;
      }
      logger.warn(
        { projectId },
        `Cached project KMS material disagrees with DB; dropping stale cache entry [projectId=${projectId}]`
      );
      await $invalidateProjectSecretManagerKmsMaterialCache(projectId);
    } catch (err) {
      // best-effort: the fresh read already succeeded, so a failed repair must never fail the request
      logger.warn({ err, projectId }, `Failed to repair project KMS material cache [projectId=${projectId}]`);
    }
  };

  const $getCachedProjectSecretManagerKmsMaterial = async (projectId: string) => {
    const cached = await withCache<TCachedProjectSmKmsMaterial>({
      keyStore,
      key: KeyStorePrefixes.KmsProjectSecretManagerMaterial(projectId),
      ttlSeconds: KMS_PROJECT_SM_MATERIAL_CACHE_TTL_SECONDS,
      fetcher: async () => {
        const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
          projectDAL.findById(projectId)
        );
        if (!project) {
          throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
        }
        return {
          kmsSecretManagerKeyId: project.kmsSecretManagerKeyId ?? null,
          kmsSecretManagerEncryptedDataKey: project.kmsSecretManagerEncryptedDataKey
            ? Buffer.from(project.kmsSecretManagerEncryptedDataKey).toString("base64")
            : null,
          orgId: project.orgId
        };
      }
    });

    return {
      kmsSecretManagerKeyId: cached.kmsSecretManagerKeyId,
      kmsSecretManagerEncryptedDataKey: cached.kmsSecretManagerEncryptedDataKey
        ? Buffer.from(cached.kmsSecretManagerEncryptedDataKey, "base64")
        : null,
      orgId: cached.orgId
    };
  };

  /** Single project row read; reuses snapshot for data-key path to avoid duplicate findById. */
  const $getProjectSecretManagerKmsKeyIdAndProject = async (projectId: string, trx?: Knex, skipCache = false) => {
    // Transactional callers (key/data-key creation, rotation, backup restore) must read fresh under their advisory lock
    if (!trx && !skipCache) {
      const material = await $getCachedProjectSecretManagerKmsMaterial(projectId);
      if (material.kmsSecretManagerKeyId) {
        return { kmsKeyId: material.kmsSecretManagerKeyId, project: material };
      }
      // No key yet: fall through to first-use creation below, which invalidates the (miss-populated) cache entry.
    }

    const project = await projectDAL.findById(projectId, trx);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    }

    if (!trx && skipCache) {
      await $repairProjectSecretManagerKmsMaterialCache(projectId, project);
    }

    if (!project.kmsSecretManagerKeyId) {
      if (trx) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsProjectKeyCreation(projectId)]);
        const kmsKeyId = await $createProjectKmsKey(projectId, trx);
        return { kmsKeyId, project };
      }

      const kmsKeyId = await projectDAL.transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsProjectKeyCreation(projectId)]);
        return $createProjectKmsKey(projectId, tx);
      });
      // First-use key creation wrote kmsSecretManagerKeyId: drop the stale (keyId=null) cache entry the miss just
      // wrote so the next read repopulates with the provisioned key.
      await $invalidateProjectSecretManagerKmsMaterialCache(projectId);

      return { kmsKeyId, project };
    }

    return { kmsKeyId: project.kmsSecretManagerKeyId, project };
  };

  const getProjectSecretManagerKmsKeyId = async (projectId: string, trx?: Knex, skipCache = false) => {
    const { kmsKeyId } = await $getProjectSecretManagerKmsKeyIdAndProject(projectId, trx, skipCache);
    return kmsKeyId;
  };

  // Helper function to create project data key within a transaction
  const $createProjectKmsDataKey = async (projectId: string, kmsKeyId: string, tx: Knex) => {
    const project = await projectDAL.findById(projectId, tx);
    if (project.kmsSecretManagerEncryptedDataKey) {
      return;
    }

    const dataKey = crypto.randomBytes(32);
    const kmsEncryptor = await encryptWithKmsKey({ kmsId: kmsKeyId }, tx);
    const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });

    await projectDAL.updateById(projectId, { kmsSecretManagerEncryptedDataKey: cipherTextBlob }, tx);

    return dataKey;
  };

  const $getProjectSecretManagerKmsDataKeyImpl = async (projectId: string, trx?: Knex, skipCache = false) => {
    const { kmsKeyId, project: projectSnapshot } = await $getProjectSecretManagerKmsKeyIdAndProject(
      projectId,
      trx,
      skipCache
    );
    let project = projectSnapshot;

    if (!project.kmsSecretManagerEncryptedDataKey) {
      let projectDataKey: Buffer | undefined;

      if (trx) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsProjectDataKeyCreation(projectId)]);
        projectDataKey = await $createProjectKmsDataKey(projectId, kmsKeyId, trx);
      } else {
        projectDataKey = await projectDAL.transaction(async (tx) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsProjectDataKeyCreation(projectId)]);
          return $createProjectKmsDataKey(projectId, kmsKeyId, tx);
        });
        // First-use data-key creation committed a new kmsSecretManagerEncryptedDataKey: drop the cache entry
        // (which may still hold encryptedDataKey=null) so the next read repopulates with the new ciphertext.
        await $invalidateProjectSecretManagerKmsMaterialCache(projectId);
      }

      if (projectDataKey) {
        return projectDataKey;
      }

      project = await projectDAL.findById(projectId, trx);
    }

    if (!project.kmsSecretManagerEncryptedDataKey) {
      throw new BadRequestError({ message: "Missing project data key" });
    }

    const kmsDecryptor = await decryptWithKmsKey({
      kmsId: kmsKeyId,
      tx: trx
    });

    return kmsDecryptor({
      cipherTextBlob: project.kmsSecretManagerEncryptedDataKey
    });
  };

  const $getProjectSecretManagerKmsDataKey = async (projectId: string, trx?: Knex) => {
    try {
      return await $getProjectSecretManagerKmsDataKeyImpl(projectId, trx);
    } catch (err) {
      // Self-heal: a NotFound here means the cached material points at a KMS key deleted by rotation
      // (invalidation failed). Drop the entry and retry once bypassing the cache.
      if (!trx && err instanceof NotFoundError) {
        logger.warn(
          { err, projectId },
          `Project KMS material resolved from cache failed with NotFound; invalidating cache and retrying fresh [projectId=${projectId}]`
        );
        await $invalidateProjectSecretManagerKmsMaterialCache(projectId);
        return await $getProjectSecretManagerKmsDataKeyImpl(projectId, undefined, true);
      }
      throw err;
    }
  };

  const $getDataKey = async (dto: TEncryptWithKmsDataKeyDTO, trx?: Knex) => {
    switch (dto.type) {
      case KmsDataKey.SecretManager: {
        return $getProjectSecretManagerKmsDataKey(dto.projectId, trx);
      }
      default: {
        return $getOrgKmsDataKey(dto.orgId, trx);
      }
    }
  };

  const $getBasicEncryptionKey = () => resolveInstanceEncryptionKeyBuffer(envConfig);

  const $decryptRootKey = async (kmsRootConfig: TKmsRootConfig) => {
    // case 1: root key is encrypted with HSM
    if (kmsRootConfig.encryptionStrategy === RootKeyEncryptionStrategy.HSM) {
      const hsmIsActive = await hsmService.isActive();
      if (!hsmIsActive) {
        throw new BadRequestError({
          message: "Unable to decrypt root KMS key. HSM service is inactive. Did you configure the HSM?"
        });
      }

      const decryptedKey = await hsmService.decrypt(kmsRootConfig.encryptedRootKey);
      return decryptedKey;
    }

    // case 2: root key is encrypted with software encryption
    if (kmsRootConfig.encryptionStrategy === RootKeyEncryptionStrategy.Software) {
      const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
      const encryptionKeyBuffer = $getBasicEncryptionKey();

      return cipher.decrypt(kmsRootConfig.encryptedRootKey, encryptionKeyBuffer);
    }

    throw new BadRequestError({ message: `Invalid root key encryption strategy: ${kmsRootConfig.encryptionStrategy}` });
  };

  const $encryptRootKey = async (plainKeyBuffer: Buffer, strategy: RootKeyEncryptionStrategy) => {
    if (strategy === RootKeyEncryptionStrategy.HSM) {
      const hsmIsActive = await hsmService.isActive();
      if (!hsmIsActive) {
        throw new BadRequestError({
          message: "Unable to encrypt root KMS key. HSM service is inactive. Did you configure the HSM?"
        });
      }
      const encrypted = await hsmService.encrypt(plainKeyBuffer);
      return encrypted;
    }

    if (strategy === RootKeyEncryptionStrategy.Software) {
      const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
      const encryptionKeyBuffer = $getBasicEncryptionKey();

      return cipher.encrypt(plainKeyBuffer, encryptionKeyBuffer);
    }

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new BadRequestError({ message: `Invalid root key encryption strategy: ${strategy}` });
  };

  // by keeping the decrypted data key in inner scope
  // none of the entities outside can interact directly or expose the data key
  // NOTICE: If changing here update migrations/utils/kms
  const createCipherPairWithDataKey = async (encryptionContext: TEncryptWithKmsDataKeyDTO, trx?: Knex) => {
    const dataKey = await $getDataKey(encryptionContext, trx);

    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    return {
      encryptor: ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
        const encryptedPlainTextBlob = cipher.encrypt(plainText, dataKey);

        // Buffer#1 encrypted text + Buffer#2 version number
        const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
        const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);
        return { cipherTextBlob };
      },
      decryptor: ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKeyDTO, "cipherTextBlob">) => {
        const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
        const decryptedBlob = cipher.decrypt(cipherTextBlob, dataKey);
        return decryptedBlob;
      },
      generateSecretBlindIndex: (secretValue: Buffer) => generateSecretValueBlindIndexFromKmsKey(secretValue, dataKey)
    };
  };

  const updateProjectSecretManagerKmsKey = async ({ projectId, kms }: TUpdateProjectSecretManagerKmsKeyDTO) => {
    // a stale cached id from a previous rotation whose invalidation failed would point at a deleted key row here.
    const { kmsKeyId } = await $getProjectSecretManagerKmsKeyIdAndProject(projectId, undefined, true);
    const currentKms = await kmsDAL.findById(kmsKeyId);

    // case: internal kms -> internal kms. no change needed
    if (kms.type === KmsType.Internal && currentKms.isReserved) {
      return KmsSanitizedSchema.parseAsync({ isExternal: false, ...currentKms });
    }

    if (kms.type === KmsType.External) {
      // validate kms is scoped in org
      const { kmsId } = kms;
      const project = await projectDAL.findById(projectId);
      if (!project) {
        throw new NotFoundError({
          message: `Project with ID '${projectId}' not found`
        });
      }
      const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
      if (!kmsDoc) {
        throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
      }

      if (kmsDoc.orgId !== project.orgId) {
        throw new ForbiddenRequestError({
          message: "KMS ID does not belong in the organization."
        });
      }
    }

    const dataKey = await $getProjectSecretManagerKmsDataKey(projectId);
    const rotatedKms = await kmsDAL.transaction(async (tx) => {
      const project = await projectDAL.findById(projectId, tx);
      let kmsId;
      if (kms.type === KmsType.Internal) {
        const internalKms = await generateKmsKey({
          isReserved: true,
          orgId: project.orgId,
          tx
        });
        kmsId = internalKms.id;
      } else {
        kmsId = kms.kmsId;
      }

      const kmsEncryptor = await encryptWithKmsKey({ kmsId }, tx);
      const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });
      await projectDAL.updateById(
        projectId,
        {
          kmsSecretManagerKeyId: kmsId,
          kmsSecretManagerEncryptedDataKey: cipherTextBlob
        },
        tx
      );
      if (currentKms.isReserved) {
        await kmsDAL.deleteById(currentKms.id, tx);
      }
      const newKms = await kmsDAL.findById(kmsId, tx);
      return KmsSanitizedSchema.parseAsync({ isExternal: !currentKms.isReserved, ...newKms });
    });

    await $invalidateProjectSecretManagerKmsMaterialCache(projectId);

    return rotatedKms;
  };

  const getProjectKeyBackup = async (projectId: string) => {
    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
      });
    }

    const secretManagerDataKey = await $getProjectSecretManagerKmsDataKey(projectId);
    const kmsKeyIdForEncrypt = await getOrgKmsKeyId(project.orgId);
    const kmsEncryptor = await encryptWithKmsKey({ kmsId: kmsKeyIdForEncrypt });
    const { cipherTextBlob: encryptedSecretManagerDataKeyWithOrgKms } = await kmsEncryptor({
      plainText: secretManagerDataKey
    });

    // backup format: version.projectId.kmsFunction.kmsId.Base64(encryptedDataKey).verificationHash
    let secretManagerBackup = `v1.${projectId}.secretManager.${kmsKeyIdForEncrypt}.${encryptedSecretManagerDataKeyWithOrgKms.toString(
      "base64"
    )}`;

    const verificationHash = crypto.nativeCrypto.createHash("sha256").update(secretManagerBackup).digest("hex");
    secretManagerBackup = `${secretManagerBackup}.${verificationHash}`;

    return {
      secretManager: secretManagerBackup
    };
  };

  const loadProjectKeyBackup = async (projectId: string, backup: string) => {
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
      });
    }

    const [, backupProjectId, , backupKmsKeyId, backupBase64EncryptedDataKey, backupHash] = backup.split(".");

    const computedHash = crypto.nativeCrypto
      .createHash("sha256")
      .update(backup.substring(0, backup.lastIndexOf(".")))
      .digest("hex");

    if (computedHash !== backupHash) {
      throw new BadRequestError({
        message: "Invalid backup"
      });
    }

    if (backupProjectId !== projectId) {
      throw new ForbiddenRequestError({
        message: "Backup does not belong to project"
      });
    }

    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(backupKmsKeyId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${backupKmsKeyId}' not found` });
    }
    if (kmsDoc.orgId !== project.orgId)
      throw new ForbiddenRequestError({
        message: "Backup does not belong to project"
      });

    const kmsDecryptor = await decryptWithKmsKey({ kmsId: backupKmsKeyId });
    const dataKey = await kmsDecryptor({
      cipherTextBlob: Buffer.from(backupBase64EncryptedDataKey, "base64")
    });

    const newKms = await kmsDAL.transaction(async (tx) => {
      const key = await generateKmsKey({
        isReserved: true,
        orgId: project.orgId,
        tx
      });

      const kmsEncryptor = await encryptWithKmsKey({ kmsId: key.id }, tx);
      const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });

      await projectDAL.updateById(
        projectId,
        {
          kmsSecretManagerKeyId: key.id,
          kmsSecretManagerEncryptedDataKey: cipherTextBlob
        },
        tx
      );
      const restoredKms = await kmsDAL.findByIdWithAssociatedKms(key.id, tx);
      if (!restoredKms) {
        // invariant: the key was created in this same transaction
        throw new NotFoundError({ message: `KMS with ID '${key.id}' not found` });
      }
      return restoredKms;
    });

    // Backup restore re-pointed the project at a freshly generated KMS key + re-wrapped data key,
    // so any cached material for this project is now stale.
    await $invalidateProjectSecretManagerKmsMaterialCache(projectId);

    return {
      secretManagerKmsKey: newKms
    };
  };

  const getKmsById = async (kmsKeyId: string, tx?: Knex) => {
    const kms = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId, tx);

    if (!kms) {
      throw new NotFoundError({
        message: `KMS with ID '${kmsKeyId}' not found`
      });
    }
    const { id, name, orgId, isExternal } = kms;
    return { id, name, orgId, isExternal };
  };

  /** Null under HSM, where no env key is involved. */
  const $currentKekLabel = () => {
    try {
      return getKekLabel($getBasicEncryptionKey());
    } catch {
      return null;
    }
  };

  /**
   * The order matters twice: it keeps resolution deterministic when a key is rotated away from and
   * later back to (two rows then open with the same key), and it makes the steady state a single
   * decrypt, which under HSM is a device round trip.
   */
  const $orderRootConfigsForResolution = (rows: TKmsRootConfig[]) => {
    const sentinel = rows.filter((row) => row.id === KMS_ROOT_CONFIG_UUID);
    const others = rows.filter((row) => row.id !== KMS_ROOT_CONFIG_UUID);
    return [...sentinel, ...others.filter((row) => !row.activatedAt), ...others.filter((row) => row.activatedAt)];
  };

  /**
   * The moment a rotation takes effect. Driven by a booting pod rather than the rotate endpoint, so
   * that generating a key is inert and an operator who never deploys it has changed nothing.
   */
  const $promoteRotation = async (stagedId: string, label: string | null) => {
    return kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      const staged = await kmsRootConfigDAL.findById(stagedId, tx);
      // Another pod promoted first, writing what we were about to write.
      if (!staged || staged.activatedAt) return false;

      const sentinel = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID, tx);
      if (!sentinel) {
        throw new InternalServerError({ message: "KMS root config is missing its active row" });
      }

      const now = new Date();

      const olderRetained = await kmsRootConfigDAL.findRetained(tx);

      // The grace window, so pods that have not rolled over can still boot. Not a rollback path.
      await kmsRootConfigDAL.create(
        {
          encryptedRootKey: sentinel.encryptedRootKey,
          encryptionStrategy: sentinel.encryptionStrategy,
          kekLabel: sentinel.kekLabel,
          activatedAt: sentinel.activatedAt ?? sentinel.createdAt,
          supersededAt: now
        },
        tx
      );

      await kmsRootConfigDAL.updateById(
        KMS_ROOT_CONFIG_UUID,
        {
          encryptedRootKey: staged.encryptedRootKey,
          encryptionStrategy: staged.encryptionStrategy,
          kekLabel: staged.kekLabel ?? label,
          activatedAt: now,
          supersededAt: null
        },
        tx
      );

      await kmsRootConfigDAL.deleteAllStaged(tx);

      const promotedLabel = staged.kekLabel ?? label;
      const previous = await kmsKekHistoryDAL.findCurrent(tx);
      if (previous) await kmsKekHistoryDAL.updateById(previous.id, { supersededAt: now }, tx);
      if (promotedLabel) {
        await kmsKekHistoryDAL.create({ kekLabel: promotedLabel, activatedAt: now }, tx);
      }

      // Exactly one retained key survives a promotion.
      for (const stale of olderRetained) {
        // eslint-disable-next-line no-await-in-loop -- at most a couple of rows
        await kmsRootConfigDAL.deleteById(stale.id, tx);
        // eslint-disable-next-line no-await-in-loop
        const entry = stale.kekLabel ? await kmsKekHistoryDAL.findActiveByLabel(stale.kekLabel, tx) : undefined;
        // eslint-disable-next-line no-await-in-loop
        if (entry) await kmsKekHistoryDAL.updateById(entry.id, { retiredAt: now }, tx);
        logger.info(
          `KMS: Removed a key superseded by an earlier rotation [rootConfigId=${stale.id}] [label=${
            stale.kekLabel ?? "unknown"
          }]`
        );
      }

      return true;
    });
  };

  const $bootstrapRootKey = async (hsmStatus: THsmStatus, skipRotationState = false) => {
    const isHsmActive = hsmStatus.isHsmConfigured;

    logger.info(`KMS: Generating new ROOT Key with ${isHsmActive ? "HSM" : "software"} encryption`);
    const newRootKey = isHsmActive ? await hsmService.randomBytes(32) : crypto.randomBytes(32);
    const encryptionStrategy = isHsmActive ? RootKeyEncryptionStrategy.HSM : RootKeyEncryptionStrategy.Software;

    // Wrapped before the transaction opens: this can be an HSM round trip. If another pod wins the
    // race below, this key is discarded unused.
    const encryptedRootKey = await $encryptRootKey(newRootKey, encryptionStrategy).catch((err) => {
      logger.error({ hsmEnabled: isHsmActive, encryptionStrategy }, "KMS: Failed to encrypt ROOT Key");
      throw err;
    });

    return kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      const existing = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID, tx);
      if (existing) return existing;

      return kmsRootConfigDAL.create(
        {
          // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
          id: KMS_ROOT_CONFIG_UUID,
          encryptedRootKey,
          encryptionStrategy,
          ...(skipRotationState ? {} : { activatedAt: new Date() })
        },
        tx
      );
    });
  };

  const $resolveRootKey = async (hsmStatus: THsmStatus, skipRotationState = false) => {
    const rows = await kmsRootConfigDAL.findAll();
    if (!rows.length) {
      const created = await $bootstrapRootKey(hsmStatus, skipRotationState);
      return $decryptRootKey(created);
    }

    const errors: unknown[] = [];
    for (const row of $orderRootConfigsForResolution(rows)) {
      // eslint-disable-next-line no-await-in-loop -- at most three rows, and the first hit returns
      const rootKey = await $decryptRootKey(row).then(
        (key) => key,
        (err: unknown) => {
          if (row.encryptionStrategy === RootKeyEncryptionStrategy.HSM) throw err;
          errors.push(err);
          return null;
        }
      );

      if (rootKey) {
        // Everything below this point writes rotation-feature state, which the migration path must not
        // touch: historical migrations boot this service long before the migration that adds it.
        if (skipRotationState) return rootKey;

        if (!row.activatedAt && row.id !== KMS_ROOT_CONFIG_UUID) {
          const label = $currentKekLabel();
          // eslint-disable-next-line no-await-in-loop
          const promoted = await $promoteRotation(row.id, label);
          if (promoted) {
            logger.info(
              `KMS: Promoted staged encryption key rotation [label=${label ?? "hsm"}] [rotationId=${row.id}]`
            );
          }
        }

        // Rows written before the label existed get it from the pod that can actually decrypt them,
        // which is the only place the value is derivable.
        if (!row.kekLabel) {
          const label = $currentKekLabel();
          if (label) {
            // eslint-disable-next-line no-await-in-loop
            await kmsRootConfigDAL
              .updateById(row.id, { kekLabel: label })
              .catch((err: unknown) => logger.warn({ err }, "KMS: Failed to label a root key row"));
          }
        }

        // Only a retained copy is worth stamping: it is positive evidence that a straggler still holds
        // that key, which is what makes the rotation GC decline to remove it. Absence proves nothing,
        // since an instance that never restarts never stamps. The sentinel is never deleted, so
        // stamping it would be a write on every boot for nothing.
        if (row.supersededAt) {
          // eslint-disable-next-line no-await-in-loop
          await kmsRootConfigDAL
            .updateById(row.id, { lastResolvedAt: new Date() })
            .catch((err: unknown) => logger.warn({ err }, "KMS: Failed to record use of a superseded root key"));
          logger.warn(
            `KMS: This instance started on a superseded encryption key [rootConfigId=${row.id}] [label=${
              $currentKekLabel() ?? "hsm"
            }]. Roll it onto the current key before the previous one is removed.`
          );
        }

        return rootKey;
      }
    }

    const label = $currentKekLabel();
    const history = await kmsKekHistoryDAL.findHistoryPage({ offset: 0, limit: 5 }).catch(() => []);
    const known = history.map((entry) => entry.kekLabel).join(", ");
    logger.error({ err: errors[0] }, "KMS: No stored root key could be decrypted with the configured encryption key");
    throw new InternalServerError({
      message: `The configured encryption key (label ${label ?? "unknown"}) does not decrypt this database's root key. ${
        known
          ? `This database was last written with encryption key label(s): ${known}. Set the matching key and restart.`
          : "Set the encryption key this database was created with and restart."
      }`
    });
  };

  const $parseLegacyKeySnapshot = (encryptedKeySnapshot: Buffer) =>
    JSON.parse(decryptWithRootKey()(encryptedKeySnapshot).toString("utf8")) as TLegacyKeyMaterial;

  /**
   * Snapshots the legacy tier's env keys under the in-DB root key, which survives an env-key rotation.
   * After this that tier no longer reads process.env, so rotating cannot strand its rows.
   */
  const $ensureLegacyKeyMaterial = async () => {
    const existing = await kmsLegacyEncryptionKeyDAL.findById(KMS_LEGACY_ENCRYPTION_KEY_UUID);
    if (existing) {
      setLegacyKeyMaterial($parseLegacyKeySnapshot(existing.encryptedKeySnapshot));
      return;
    }

    const current: TLegacyKeySnapshot = {
      ENCRYPTION_KEY: envConfig.ENCRYPTION_KEY,
      ROOT_ENCRYPTION_KEY: envConfig.ROOT_ENCRYPTION_KEY
    };

    // The FIPS relabel overwrites ROOT_ENCRYPTION_KEY unconditionally, so `current` can be missing the
    // key existing rows were written under. Capturing it also means fixing that later needs no repair.
    const originalCfg = getOriginalConfig() as TLegacyKeySnapshot | undefined;
    const original: TLegacyKeySnapshot | undefined = originalCfg
      ? { ENCRYPTION_KEY: originalCfg.ENCRYPTION_KEY, ROOT_ENCRYPTION_KEY: originalCfg.ROOT_ENCRYPTION_KEY }
      : undefined;

    const hasKey = (snapshot?: TLegacyKeySnapshot) =>
      Boolean(snapshot && (snapshot.ENCRYPTION_KEY || snapshot.ROOT_ENCRYPTION_KEY));

    // Pure HSM, no env key: leave the legacy tier throwing exactly as it does today.
    if (!hasKey(current) && !hasKey(original)) return;

    const material: TLegacyKeyMaterial = { current, original };
    const encryptedKeySnapshot = encryptWithRootKey()(Buffer.from(JSON.stringify(material), "utf8"));

    await kmsLegacyEncryptionKeyDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);
      const alreadySeeded = await kmsLegacyEncryptionKeyDAL.findById(KMS_LEGACY_ENCRYPTION_KEY_UUID, tx);
      if (alreadySeeded) return;
      await kmsLegacyEncryptionKeyDAL.create(
        {
          // @ts-expect-error id is fixed so a concurrent seed conflicts rather than duplicating
          id: KMS_LEGACY_ENCRYPTION_KEY_UUID,
          encryptedKeySnapshot
        },
        tx
      );
    });

    // Re-read so every pod lands on the row that won the race, not its own candidate.
    const seeded = await kmsLegacyEncryptionKeyDAL.findById(KMS_LEGACY_ENCRYPTION_KEY_UUID);
    setLegacyKeyMaterial(seeded ? $parseLegacyKeySnapshot(seeded.encryptedKeySnapshot) : material);
  };

  /**
   * Backfills the key an instance already runs with, so a pre-rotation dump still has a label an
   * operator can match against an archived key.
   */
  const $ensureKekHistory = async () => {
    const label = $currentKekLabel();
    if (!label) return;

    const current = await kmsKekHistoryDAL.findCurrent();
    if (current) return;

    const sentinel = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    await kmsRootConfigDAL
      .transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);
        if (await kmsKekHistoryDAL.findCurrent(tx)) return;
        await kmsKekHistoryDAL.create(
          { kekLabel: label, activatedAt: sentinel?.activatedAt ?? sentinel?.createdAt ?? new Date() },
          tx
        );
      })
      .catch((err: unknown) => {
        // Never block boot on a bookkeeping row.
        logger.warn({ err }, "KMS: Failed to record initial encryption key history entry");
      });
  };

  /**
   * `skipRotationState` is for callers that run *inside* a database migration. Historical migrations boot
   * this service to re-encrypt data, and they run long before the migration that adds the rotation
   * columns and tables, so touching any of it there fails on a fresh database. Such a caller only needs
   * the root key in memory; the legacy-key snapshot is deliberately skipped too, and the legacy helpers
   * fall back to reading the environment, which is correct for a migration.
   */
  const startService = async (hsmStatus: THsmStatus, { skipRotationState = false } = {}) => {
    const decryptedRootKey = await $resolveRootKey(hsmStatus, skipRotationState);

    logger.info("KMS: Loading ROOT Key into Memory.");
    ROOT_ENCRYPTION_KEY = decryptedRootKey;

    if (skipRotationState) return;

    await $ensureLegacyKeyMaterial();
    await $ensureKekHistory();
  };

  /** How a rotation stages a key the instance is not running with yet. */
  const encryptRootKeyForKek = (kekBuffer: Buffer) => {
    if (!ROOT_ENCRYPTION_KEY.length) {
      throw new InternalServerError({ message: "KMS root key is not loaded" });
    }
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    return cipher.encrypt(ROOT_ENCRYPTION_KEY, kekBuffer);
  };

  const getCurrentKekLabel = () => $currentKekLabel();

  const updateEncryptionStrategy = async (strategy: RootKeyEncryptionStrategy) => {
    // A fleet-wide cutover. Unguarded, a switch to HSM would not take effect while a retained software
    // copy exists: a pod with the old env key would resolve that copy and boot without the device.
    const [staged, retained] = await Promise.all([kmsRootConfigDAL.findStaged(), kmsRootConfigDAL.findRetained()]);
    if (staged.length || retained.length) {
      throw new BadRequestError({
        message:
          "An encryption key rotation is still in progress. Complete or discard it before changing the root key encryption strategy."
      });
    }

    const kmsRootConfig = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    if (!kmsRootConfig) {
      throw new NotFoundError({ message: "KMS root config not found" });
    }

    if (kmsRootConfig.encryptionStrategy === strategy) {
      return;
    }

    if (strategy === RootKeyEncryptionStrategy.Software) {
      if (!envConfig.ROOT_ENCRYPTION_KEY && !envConfig.ENCRYPTION_KEY) {
        throw new BadRequestError({
          message:
            "Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY environment variable and restart your deployment before trying to update the encryption strategy to software mode."
        });
      }
    }

    if (kmsRootConfig.encryptionStrategy === RootKeyEncryptionStrategy.Software) {
      const currentLabel = $currentKekLabel();
      if (kmsRootConfig.kekLabel && currentLabel && kmsRootConfig.kekLabel !== currentLabel) {
        throw new BadRequestError({
          message: `This instance is running with encryption key label '${currentLabel}', but the active root key was written with '${kmsRootConfig.kekLabel}'. Restart it with the current encryption key before changing the root key encryption strategy.`
        });
      }
    }

    // Both can be HSM round trips, so they stay outside the transaction.
    const decryptedRootKey = await $decryptRootKey(kmsRootConfig);
    const encryptedRootKey = await $encryptRootKey(decryptedRootKey, strategy);

    if (!encryptedRootKey) {
      logger.error("KMS: Failed to re-encrypt ROOT Key with selected strategy");
      throw new BadRequestError({ message: "Failed to re-encrypt ROOT Key with selected strategy" });
    }

    await kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      const [stagedNow, retainedNow, sentinelNow] = await Promise.all([
        kmsRootConfigDAL.findStaged(tx),
        kmsRootConfigDAL.findRetained(tx),
        kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID, tx)
      ]);
      if (stagedNow.length || retainedNow.length) {
        throw new BadRequestError({
          message:
            "An encryption key rotation is still in progress. Complete or discard it before changing the root key encryption strategy."
        });
      }

      if (!sentinelNow || !sentinelNow.encryptedRootKey.equals(kmsRootConfig.encryptedRootKey)) {
        throw new BadRequestError({
          message:
            "The active root key changed while this request was in flight, so the encryption strategy was left unchanged. Retry the change."
        });
      }

      await kmsRootConfigDAL.updateById(
        KMS_ROOT_CONFIG_UUID,
        {
          encryptedRootKey,
          encryptionStrategy: strategy,
          kekLabel: strategy === RootKeyEncryptionStrategy.Software ? $currentKekLabel() : null
        },
        tx
      );
    });

    ROOT_ENCRYPTION_KEY = decryptedRootKey;
  };

  return {
    startService,
    encryptRootKeyForKek,
    getCurrentKekLabel,
    generateKmsKey,
    rotateKmsKey,
    deleteInternalKms,
    encryptWithKmsKey,
    decryptWithKmsKey,
    encryptWithInputKey,
    decryptWithInputKey,
    encryptWithRootKey,
    decryptWithRootKey,
    getOrgKmsKeyId,
    updateEncryptionStrategy,
    getProjectSecretManagerKmsKeyId,
    updateProjectSecretManagerKmsKey,
    getProjectKeyBackup,
    loadProjectKeyBackup,
    getKmsById,
    createCipherPairWithDataKey,
    getKeyMaterial,
    getBulkKeyMaterial,
    importKeyMaterial,
    getParamsForImport,
    importWrappedKeyMaterial,
    signWithKmsKey,
    verifyWithKmsKey,
    generateMac,
    verifyMac,
    getPublicKey
  };
};
