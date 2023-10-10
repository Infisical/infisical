import { randomBytes } from "crypto";
import * as argon2 from "argon2";

import { 
  GitRisksEncryptionProperties,
  GitSecretBlindIndexData,
  IGitSecretBlindIndexData
 } from "../ee/models";
import {
  ALGORITHM_AES_256_GCM,
  ARGON_BLIND_INDEX_PARAMS,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8
} from "../variables";
import {
  decryptSymmetric128BitHexKeyUTF8,
  encryptSymmetric128BitHexKeyUTF8
} from "../utils/crypto";
import { 
  client, 
  getEncryptionKey, 
  getRootEncryptionKey
 } from "../config";
import { 
  GitSecretBlindIndexHashingError,
  GitSecretBlindIndexSaltNotFoundError,
 } from "../utils/errors";
import { 
  SALT_BLIND_INDEX_PARAMS
} from "../variables/crypto";
import {
  CreateGitSecretBlindIndexDataParams,
  CreateGitSecretBlindIndexParams,
  CreateGitSecretBlindIndexWithSaltParams,
  DecryptGitSecretBlindIndexSaltParams,
  EncryptGitSecretParams,
  GetGitSecretBlindIndexSaltParams,
} from "../interfaces/services/SecretScanningService";

/**
 * Helper function to create the Git secret blind index for a single Git secret [gitSecret] 
 * using secure Argon2id hashing given the Git secret blind index salt for the organization [salt]
 * @param {Object} obj - The input parameters for creating Git secret blind index data.
 * @param {String} obj.gitSecret - raw Git secret value from the Infisical Radar scan
 * @param {String} obj.salt - salted organization id for the GitHub organization connected to Infisical Radar
 * @returns {Promise<string>} - A Promise that resolves to the Git secret blind index for the organization.
 */
const createGitSecretBlindIndex = async ({
  gitSecret,
  salt,
}: CreateGitSecretBlindIndexParams): Promise<string> => { 

  try {
    const gitSecretBlindIndex: string = await argon2.hash(gitSecret, {
      salt: Buffer.from(salt, ENCODING_SCHEME_BASE64),
      ...ARGON_BLIND_INDEX_PARAMS,
    })
    return gitSecretBlindIndex;
  } catch (err: any) {
    throw GitSecretBlindIndexHashingError();
  }
};

/**
 * Helper function to decrypt the Git secret blind index salt for the organization
 * given the Git secret blind index data [gitSecretBlindIndexData]
 * @param {Object} obj - The input parameters for creating Git secret blind index data.
 * @param {IGitSecretBlindIndexData} obj.gitSecretBlindIndexData - the Git secret blind index data for the organization
 * @returns {Promise<string>} - A Promise that resolves to the Git secret blind index salt for the organization.
 */
const decryptGitSecretBlindIndexSaltHelper = async ({
  gitSecretBlindIndexData,
}: DecryptGitSecretBlindIndexSaltParams): Promise<string> => {
  const encryptionKey: string = await getEncryptionKey();
  const rootEncryptionKey: string = await getRootEncryptionKey();

  if (rootEncryptionKey && gitSecretBlindIndexData.keyEncoding === ENCODING_SCHEME_BASE64) {
    const salt = client.decryptSymmetric(
      gitSecretBlindIndexData.encryptedSaltCiphertext,
      rootEncryptionKey,
      gitSecretBlindIndexData.saltIV,
      gitSecretBlindIndexData.saltTag
    )
    return salt;
  } else if (encryptionKey && gitSecretBlindIndexData.keyEncoding === ENCODING_SCHEME_UTF8) {
    const salt = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: gitSecretBlindIndexData.encryptedSaltCiphertext,
      iv: gitSecretBlindIndexData.saltIV,
      tag: gitSecretBlindIndexData.saltTag,
      key: encryptionKey
    })
    return salt;
  } else throw GitSecretBlindIndexSaltNotFoundError();
};

/**
 * Create secret blind index data containing encrypted blind index salt
 * for the GitHub organization's ID [organizationId].
 * @param {Object} obj - The input parameters for creating Git secret blind index data.
 * @param {String} obj.organizationId - GitHub organization's ID for Infisical Radar.
 * @returns {Promise<string>} - A Promise that resolves to the generated Git secret blind index salt for the organization.
 */
export const createGitSecretBlindIndexDataHelper = async ({
  organizationId
}: CreateGitSecretBlindIndexDataParams): Promise<string> => {

  // initialize random blind index salt for the organization
  const salt = randomBytes(SALT_BLIND_INDEX_PARAMS.SALT_LENGTH).toString(SALT_BLIND_INDEX_PARAMS.ENCODING);

  const encryptionKey: string = await getEncryptionKey();
  const rootEncryptionKey: string = await getRootEncryptionKey();

  if (rootEncryptionKey) {
    const {
      ciphertext: encryptedSaltCiphertext,
      iv: saltIV,
      tag: saltTag
    } = client.encryptSymmetric(salt, rootEncryptionKey)

    await new GitSecretBlindIndexData({
      organizationId,
      encryptedSaltCiphertext,
      saltIV,
      saltTag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_BASE64
    }).save()

  } else {
    const {
      ciphertext: encryptedSaltCiphertext,
      iv: saltIV,
      tag: saltTag
    } = encryptSymmetric128BitHexKeyUTF8({
      plaintext: salt,
      key: encryptionKey
    })

    await new GitSecretBlindIndexData({
      organizationId,
      encryptedSaltCiphertext,
      saltIV,
      saltTag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8
    }).save()
  }
  return salt;
};

/**
 * Generate blind index for the Git secret finding values [gitSecret]
 * and salt [salt]
 * @param {Object} obj
 * @param {String} obj.gitSecret - raw Git secret value from the Infisical Radar scan
 * @param {String} obj.salt - salted organization id for the GitHub organization connected to Infisical Radar
 * @returns {Promise<string>} - A Promise that resolves to the generated Git secret blind index.
 */
export const createGitSecretBlindIndexWithSaltHelper = async ({
  gitSecret,
  salt
}: CreateGitSecretBlindIndexWithSaltParams): Promise<string> => {

  const gitSecretBlindIndex = await createGitSecretBlindIndex({gitSecret, salt})
  return gitSecretBlindIndex;
};

/**
 * Helper function to encrypt the Git secret values [gitSecrets] provided, ignoring duplicates.
 * @param {Object} obj - The input parameters for creating Git secret blind index data.
 * @param {String} obj.gitSecret - raw Git secret value from the Infisical Radar scan
 * @returns {Promise<GitRisksEncryptionProperties>} - A Promise that resolves to the encrypted Git secret properties in GitRisks
 */
export const encryptGitSecretHelper = async ({ gitSecret }: EncryptGitSecretParams): Promise<GitRisksEncryptionProperties> => {
  const encryptionKey: string = await getEncryptionKey();
  const rootEncryptionKey: string = await getRootEncryptionKey();

  if (rootEncryptionKey) {
    const { ciphertext, iv, tag } = client.encryptSymmetric(gitSecret, rootEncryptionKey);

    const newEncrytedData: GitRisksEncryptionProperties = {
      gitSecretValueCiphertext: ciphertext,
      gitSecretValueIV: iv,
      gitSecretValueTag: tag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_BASE64,
    }
    return newEncrytedData;
  } else {
    const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8({
      plaintext: gitSecret,
      key: encryptionKey,
    })

    const newEncrytedData: GitRisksEncryptionProperties = {
      gitSecretValueCiphertext: ciphertext,
      gitSecretValueIV: iv,
      gitSecretValueTag: tag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8,
    }
    return newEncrytedData;
  }
};

/**
 * Get secret blind index salt for organization's GitHub ID [organizationId]
 * @param {Object} obj
 * @param {String} obj.organizationId - Infisical id for the GitHub organization connected to Infisical Radar
 * @returns {Promise<string>} - A Promise that resolves to the Git secret blind index salt for the organization.
 */
export const getGitSecretBlindIndexSaltHelper = async ({
  organizationId
}: GetGitSecretBlindIndexSaltParams): Promise<string> => {

  const gitSecretBlindIndexData: IGitSecretBlindIndexData = await GitSecretBlindIndexData.findOne({
    organizationId
  }).select("+encryptedSaltCiphertext +saltIV +saltTag +algorithm +keyEncoding");

  // first check if the salt exists, if it doesn't this is a legacy situation and we need to create it
  if (!gitSecretBlindIndexData) {
    return await createGitSecretBlindIndexDataHelper({ organizationId });
  } else {
    return await decryptGitSecretBlindIndexSaltHelper({ gitSecretBlindIndexData });
  }
};
