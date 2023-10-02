import { FilterQuery, UpdateQuery } from "mongoose";
import { AnyBulkWriteOperation } from "mongodb";
import { promisify } from "util";
import { randomBytes } from "crypto";
import * as argon2 from "argon2";

import {
  GitSecret, 
  GitSecretBlindIndexData,
  IGitSecret, 
  IGitSecretBlindIndexData,
} from "../models";
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
  GitSecretNotFoundError,
  GitSecretsBulkUpdateError,
 } from "../utils/errors";
import { 
  SALT_BLIND_INDEX_PARAMS
} from "../variables/crypto";
import {
  CreateGitSecretBlindIndexDataParams,
  CreateGitSecretBlindIndexParams,
  CreateGitSecretBlindIndexWithSaltParams,
  CreateGitSecretBlindIndexesWithSaltParams,
  CreateGitSecretsParams,
  DecryptGitSecretBlindIndexSaltParams,
  EncryptGitSecretsParams,
  GetGitSecretBlindIndexSaltParams,
  GetGitSecretsParams,
  UpdateGitSecretParams,
  UpdateGitSecretsParams
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
 * Helper function to encrypt the Git secret values [gitSecrets] provided, ignoring duplicates.
 * @param {Object} obj - The input parameters for creating Git secret blind index data.
 * @param {String[]} obj.gitSecrets - raw Git secret values from the Infisical Radar scan
 * @returns {Promise<IGitSecret[]>} - A Promise that resolves to the encrypted Git secrets.
 */
const encryptGitSecretsHelper = async ({ gitSecrets }: EncryptGitSecretsParams): Promise<IGitSecret[]> => {
  const encryptionKey: string = await getEncryptionKey();
  const rootEncryptionKey: string = await getRootEncryptionKey();

  const uniqueGitSecrets = new Set(gitSecrets);
  const encryptedGitSecrets: IGitSecret[] = [];

  for (const gitSecret of uniqueGitSecrets) {
    if (rootEncryptionKey) {
      const { ciphertext, iv, tag } = client.encryptSymmetric(gitSecret, rootEncryptionKey);

      const newGitSecret = new GitSecret({
        gitSecretValueCiphertext: ciphertext,
        gitSecretValueIV: iv,
        gitSecretValueTag: tag,
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_BASE64,
      })

      encryptedGitSecrets.push(newGitSecret);
    } else {
      const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8({
        plaintext: gitSecret,
        key: encryptionKey,
      })

      const newGitSecret = new GitSecret({
        gitSecretValueCiphertext: ciphertext,
        gitSecretValueIV: iv,
        gitSecretValueTag: tag,
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8,
      })

      encryptedGitSecrets.push(newGitSecret);
    }
  }

  return encryptedGitSecrets;
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
  const randomBytesPromisified = promisify(randomBytes);
  const saltBuffer = await randomBytesPromisified(SALT_BLIND_INDEX_PARAMS.SALT_LENGTH);
  const salt = saltBuffer.toString(SALT_BLIND_INDEX_PARAMS.ENCODING);

  const encryptionKey: string = await getEncryptionKey();
  const rootEncryptionKey: string = await getRootEncryptionKey();

  if (rootEncryptionKey) {
    const {
      ciphertext: encryptedSaltCiphertext,
      iv: saltIV,
      tag: saltTag
    } = client.encryptSymmetric(salt, rootEncryptionKey)

    await new GitSecretBlindIndexData({
      organizationId: organizationId,
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
      organizationId: organizationId,
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
 * Check if there is already a Git secret blind index for the Git secret findings [gitSecrets]
 * @param {Object} obj
 * @param {String[]} obj.gitSecrets - raw Git secret values from the Infisical Radar scan
 * @param {String} obj.salt - 16-byte random salt tied to the GitHub organization that is connected to Infisical Radar
 * @returns {Promise<string[]>} - A Promise that resolves to the generated Git secret blind indexes.
 */
export const createGitSecretBlindIndexesWithSaltHelper = async ({
  gitSecrets,
  salt
}: CreateGitSecretBlindIndexesWithSaltParams): Promise<string[]> => {

  const gitSecretBlindIndexes: string[] = [];

  for (const gitSecret of gitSecrets) {
    const gitSecretBlindIndex = await createGitSecretBlindIndex({ gitSecret, salt })
    gitSecretBlindIndexes.push(gitSecretBlindIndex);
  }
  return gitSecretBlindIndexes;
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
 * Create encrypted Git secrets and corresponding blind indexes
 * @param {Object} obj
 * @param {Set<string>|string[]} obj.gitSecrets - raw values of the Git secrets found in the Infisical Radar scan
 * @param {String[]} obj.gitSecretBlindIndexes - Git secret blind indexes
 * @param {String} obj.organizationId - Infisical id for the GitHub organization connected to Infisical Radar
 * @param {String} obj.salt - 16-byte random salt tied to the GitHub organization connected to Infisical Radar
 * @returns {Promise<string[]>} - A Promise that resolves to the generated Git secret blind indexes.
 */
export const createGitSecretsHelper = async ({
  gitSecrets,
  gitSecretBlindIndexes,
  organizationId,
  salt,
  status
}: CreateGitSecretsParams): Promise<string[]> => {

  const gitSecretsArray = Array.isArray(gitSecrets) ? gitSecrets : Array.from(gitSecrets); // change from set to array for the push event
  const encryptedGitSecrets = await encryptGitSecretsHelper({ gitSecrets: gitSecretsArray }); // returns only unique values

  const blindIndexesToInsert = new Set<string>(); // same indexing as the encryptedGitSecrets
  const allBlindIndexes: string[] = [];

  if (!gitSecretBlindIndexes || (Array.isArray(gitSecretBlindIndexes) && gitSecretBlindIndexes.length === 0)) {
    // the full repo scan function did not create the blind indexes
    const newIndexes = await createGitSecretBlindIndexesWithSaltHelper({
      gitSecrets,
      salt
    })

    newIndexes.forEach(index => {
      blindIndexesToInsert.add(index);
      allBlindIndexes.push(index);
    })
  } else {
    // the push event function has already created the blind indexes
    gitSecretBlindIndexes.forEach(index => {
      blindIndexesToInsert.add(index);
      allBlindIndexes.push(index);
    })
  }

  const encryptedGitSecretsToInsert: IGitSecret[] = [];

  for (const gitSecretBlindIndex of blindIndexesToInsert) {
    // Check for existing saved duplicates
    const existingGitSecret = await GitSecret.findOne({
      gitSecretBlindIndex,
      organizationId,
    }).select("+gitSecretBlindIndex")

    if (existingGitSecret) {
      // if the Git secret blind index already exists, skip it as we don't want to insert it into Git secrets again
      continue;
    }

    const newGitSecret = encryptedGitSecrets[encryptedGitSecretsToInsert.length];

    Object.assign(newGitSecret, {
      organizationId,
      gitSecretBlindIndex,
      status,
    })

    encryptedGitSecretsToInsert.push(newGitSecret);
  }

  if (encryptedGitSecretsToInsert.length > 0) {
    await GitSecret.insertMany(encryptedGitSecretsToInsert);
  }

  return allBlindIndexes;
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

/**
 * Get bulk encrypted & hashed Git secret findings [gitSecrets] by Git risk status [status] (if provided) for the GitHub organization
 * connected to Infisical Radar [organizationId]
 * @param {Object} obj
 * @param {String} obj.organizationId - Infisical organization ID of the GitHub organization connected to Infisical Radar
 * @returns {Promise<IGitSecret[]>} - A Promise that resolves to the Git secrets that match the criteria.
 */
export const getGitSecretsHelper = async ({
  organizationId,
  status
}: GetGitSecretsParams): Promise<IGitSecret[]> => {
  let gitSecrets: IGitSecret[] = [];

  gitSecrets = gitSecrets.concat(
    await GitSecret.find({
      organizationId,
      status,
      secretBlindIndex: {
        $nin: gitSecrets.map((gitSecret) => gitSecret.gitSecretBlindIndex)
      }
    }).select("+gitSecretBlindIndex")
      .lean()
  )

  return gitSecrets;
};

/**
 * Update Git risk status [status] of bulk Git secret findings [gitRisks]
 * @param {Object} obj
 * @param {String} obj.gitSecretBlindIndex - value of the Git secret finding to update
 * @param {String} obj.organizationId - Infisical organization ID of the GitHub organization connected to Infisical Radar
 * @param {RiskStatus} obj.status - Git risk status of the Git secret finding to update
 */
export const updateGitSecretHelper = async ({
  gitSecretBlindIndex,
  organizationId,
  status,
}: UpdateGitSecretParams): Promise<void> => {

  const gitSecret = await GitSecret.findOneAndUpdate(
    { gitSecretBlindIndex, organizationId },
    { $set: { status } },
    { new: true }
  ).select("+gitSecretBlindIndex").lean();

  if (!gitSecret) throw GitSecretNotFoundError();
};

/**
 * Update Git risk status [status] of bulk Git secret findings [gitRisks]. This
 * will update the Git secret risk status for that unique Git secret as well, even
 * if there are other fingerprints with the same blind index
 * @param {Object} obj
 * @param {Set<string>} obj.gitSecretBlindIndexes - unique Git secret blind indexes to update
 * @param {String} obj.organizationId - Infisical organization ID of the GitHub organization connected to Infisical Radar
 * @param {RiskStatus} obj.status - Git risk status of the Git secret finding to update
 */
export const updateGitSecretsHelper = async ({
  gitSecretBlindIndexes,
  organizationId,
  status,
}: UpdateGitSecretsParams): Promise<void> => {

  try {
    if (!gitSecretBlindIndexes || (gitSecretBlindIndexes instanceof Set && gitSecretBlindIndexes.size === 0)) {
      return;
    }

    const bulkUpdateOperations = Array.from(gitSecretBlindIndexes).map((gitSecretBlindIndex) => {
      const filter: FilterQuery<IGitSecret> = {
        gitSecretBlindIndex,
        organizationId,
        status: { $ne: status },
      }

      const update: UpdateQuery<IGitSecret> = {
        $set: { status },
      }

      return {
        updateOne: {
          filter,
          update,
        },
      };
    })

    await GitSecret.bulkWrite(bulkUpdateOperations as AnyBulkWriteOperation<IGitSecret>[]);
  } catch (err) {
    throw GitSecretsBulkUpdateError();
  }
};
