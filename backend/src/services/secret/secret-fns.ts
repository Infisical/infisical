/* eslint-disable no-await-in-loop */
import { subject } from "@casl/ability";
import path from "path";

import {
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TableName,
  TSecretBlindIndexes,
  TSecretFolders,
  TSecrets
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import {
  buildSecretBlindIndexFromName,
  decryptSymmetric128BitHexKeyUTF8,
  encryptSymmetric128BitHexKeyUTF8
} from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import {
  fnSecretBulkInsert as fnSecretV2BridgeBulkInsert,
  fnSecretBulkUpdate as fnSecretV2BridgeBulkUpdate,
  getAllNestedSecretReferences as getAllNestedSecretReferencesV2Bridge
} from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { KmsDataKey } from "../kms/kms-types";
import { getBotKeyFnFactory } from "../project-bot/project-bot-fns";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretDALFactory } from "./secret-dal";
import {
  TCreateManySecretsRawFn,
  TCreateManySecretsRawFnFactory,
  TFnSecretBlindIndexCheck,
  TFnSecretBlindIndexCheckV2,
  TFnSecretBulkDelete,
  TFnSecretBulkInsert,
  TFnSecretBulkUpdate,
  TUpdateManySecretsRawFn,
  TUpdateManySecretsRawFnFactory
} from "./secret-types";

export const generateSecretBlindIndexBySalt = async (secretName: string, secretBlindIndexDoc: TSecretBlindIndexes) => {
  const appCfg = getConfig();
  const secretBlindIndex = await buildSecretBlindIndexFromName({
    secretName,
    keyEncoding: secretBlindIndexDoc.keyEncoding as SecretKeyEncoding,
    rootEncryptionKey: appCfg.ROOT_ENCRYPTION_KEY,
    encryptionKey: appCfg.ENCRYPTION_KEY,
    tag: secretBlindIndexDoc.saltTag,
    ciphertext: secretBlindIndexDoc.encryptedSaltCipherText,
    iv: secretBlindIndexDoc.saltIV
  });
  return secretBlindIndex;
};

type TRecursivelyFetchSecretsFromFoldersArg = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
};

type TGetPathsDTO = {
  projectId: string;
  environment: string;
  currentPath: string;

  auth: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string | undefined;
  };
};

// Introduce a new interface for mapping parent IDs to their children
interface FolderMap {
  [parentId: string]: TSecretFolders[];
}
const buildHierarchy = (folders: TSecretFolders[]): FolderMap => {
  const map: FolderMap = {};
  map.null = []; // Initialize mapping for root directory

  folders.forEach((folder) => {
    const parentId = folder.parentId || "null";
    if (!map[parentId]) {
      map[parentId] = [];
    }
    map[parentId].push(folder);
  });

  return map;
};

const generatePaths = (
  map: FolderMap,
  parentId: string = "null",
  basePath: string = "",
  currentDepth: number = 0
): { path: string; folderId: string }[] => {
  const children = map[parentId || "null"] || [];
  let paths: { path: string; folderId: string }[] = [];

  children.forEach((child) => {
    // Determine if this is the root folder of the environment. If no parentId is present and the name is root, it's the root folder
    const isRootFolder = child.name === "root" && !child.parentId;

    // Form the current path based on the base path and the current child
    // eslint-disable-next-line no-nested-ternary
    const currPath = basePath === "" ? (isRootFolder ? "/" : `/${child.name}`) : `${basePath}/${child.name}`;

    // Add the current path
    paths.push({
      path: currPath,
      folderId: child.id
    });

    // We make sure that the recursion depth doesn't exceed 20.
    // We do this to create "circuit break", basically to ensure that we can't encounter any potential memory leaks.
    if (currentDepth >= 20) {
      logger.info(`generatePaths: Recursion depth exceeded 20, breaking out of recursion [map=${JSON.stringify(map)}]`);
      return;
    }
    // Recursively generate paths for children, passing down the formatted path
    const childPaths = generatePaths(map, child.id, currPath, currentDepth + 1);
    paths = paths.concat(
      childPaths.map((p) => ({
        path: p.path,
        folderId: p.folderId
      }))
    );
  });

  return paths;
};

export const recursivelyGetSecretPaths = ({
  folderDAL,
  projectEnvDAL,
  permissionService
}: TRecursivelyFetchSecretsFromFoldersArg) => {
  const getPaths = async ({ projectId, environment, currentPath, auth }: TGetPathsDTO) => {
    const env = await projectEnvDAL.findOne({
      projectId,
      slug: environment
    });

    if (!env) {
      throw new Error(`'${environment}' environment not found in project with ID ${projectId}`);
    }

    // Fetch all folders in env once with a single query
    const folders = await folderDAL.find({
      envId: env.id,
      isReserved: false
    });

    // Build the folder hierarchy map
    const folderMap = buildHierarchy(folders);

    // Generate the paths paths and normalize the root path to /
    const paths = generatePaths(folderMap).map((p) => ({
      path: p.path === "/" ? p.path : p.path.substring(1),
      folderId: p.folderId
    }));

    const { permission } = await permissionService.getProjectPermission(
      auth.actor,
      auth.actorId,
      projectId,
      auth.actorAuthMethod,
      auth.actorOrgId
    );

    // Filter out paths that the user does not have permission to access, and paths that are not in the current path
    const allowedPaths = paths.filter(
      (folder) =>
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, {
            environment,
            secretPath: folder.path
          })
        ) && folder.path.startsWith(currentPath === "/" ? "" : currentPath)
    );

    return allowedPaths;
  };

  return getPaths;
};

type TInterpolateSecretArg = {
  projectId: string;
  secretEncKey: string;
  secretDAL: Pick<TSecretDALFactory, "findByFolderId">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
};

const INTERPOLATION_SYNTAX_REG = /\${([^}]+)}/g;
export const interpolateSecrets = ({ projectId, secretEncKey, secretDAL, folderDAL }: TInterpolateSecretArg) => {
  const fetchSecretsCrossEnv = () => {
    const fetchCache: Record<string, Record<string, string>> = {};

    return async (secRefEnv: string, secRefPath: string[], secRefKey: string) => {
      const secRefPathUrl = path.join("/", ...secRefPath);
      const uniqKey = `${secRefEnv}-${secRefPathUrl}`;

      if (fetchCache?.[uniqKey]) {
        return fetchCache[uniqKey][secRefKey];
      }

      const folder = await folderDAL.findBySecretPath(projectId, secRefEnv, secRefPathUrl);
      if (!folder) return "";
      const secrets = await secretDAL.findByFolderId(folder.id);

      const decryptedSec = secrets.reduce<Record<string, string>>((prev, secret) => {
        const secretKey = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretKeyCiphertext,
          iv: secret.secretKeyIV,
          tag: secret.secretKeyTag,
          key: secretEncKey
        });
        const secretValue = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretValueCiphertext,
          iv: secret.secretValueIV,
          tag: secret.secretValueTag,
          key: secretEncKey
        });

        // eslint-disable-next-line
        prev[secretKey] = secretValue;
        return prev;
      }, {});

      fetchCache[uniqKey] = decryptedSec;

      return fetchCache[uniqKey][secRefKey];
    };
  };

  const recursivelyExpandSecret = async (
    expandedSec: Record<string, string>,
    interpolatedSec: Record<string, string>,
    fetchCrossEnv: (env: string, secPath: string[], secKey: string) => Promise<string>,
    recursionChainBreaker: Record<string, boolean>,
    key: string
  ) => {
    if (expandedSec?.[key] !== undefined) {
      return expandedSec[key];
    }
    if (recursionChainBreaker?.[key]) {
      return "";
    }
    // eslint-disable-next-line
    recursionChainBreaker[key] = true;

    let interpolatedValue = interpolatedSec[key];
    if (!interpolatedValue) {
      // eslint-disable-next-line no-console
      console.error(`Couldn't find referenced value - ${key}`);
      return "";
    }

    const refs = interpolatedValue.match(INTERPOLATION_SYNTAX_REG);
    if (refs) {
      for (const interpolationSyntax of refs) {
        const interpolationKey = interpolationSyntax.slice(2, interpolationSyntax.length - 1);
        const entities = interpolationKey.trim().split(".");

        if (entities.length === 1) {
          const val = await recursivelyExpandSecret(
            expandedSec,
            interpolatedSec,
            fetchCrossEnv,
            recursionChainBreaker,
            interpolationKey
          );
          if (val) {
            interpolatedValue = interpolatedValue.replaceAll(interpolationSyntax, val);
          }
          // eslint-disable-next-line
          continue;
        }

        if (entities.length > 1) {
          const secRefEnv = entities[0];
          const secRefPath = entities.slice(1, entities.length - 1);
          const secRefKey = entities[entities.length - 1];

          const val = await fetchCrossEnv(secRefEnv, secRefPath, secRefKey);
          if (val) {
            interpolatedValue = interpolatedValue.replaceAll(interpolationSyntax, val);
          }
        }
      }
    }

    // eslint-disable-next-line
    expandedSec[key] = interpolatedValue;
    return interpolatedValue;
  };

  // used to convert multi line ones to quotes ones with \n
  const formatMultiValueEnv = (val?: string) => {
    if (!val) return "";
    if (!val.match("\n")) return val;
    return `"${val.replace(/\n/g, "\\n")}"`;
  };

  const expandSecrets = async (
    secrets: Record<string, { value: string; comment?: string; skipMultilineEncoding?: boolean | null }>
  ) => {
    const expandedSec: Record<string, string> = {};
    const interpolatedSec: Record<string, string> = {};

    const crossSecEnvFetch = fetchSecretsCrossEnv();

    Object.keys(secrets).forEach((key) => {
      if (secrets[key].value.match(INTERPOLATION_SYNTAX_REG)) {
        interpolatedSec[key] = secrets[key].value;
      } else {
        expandedSec[key] = secrets[key].value;
      }
    });

    for (const key of Object.keys(secrets)) {
      if (expandedSec?.[key]) {
        // should not do multi line encoding if user has set it to skip
        // eslint-disable-next-line
        secrets[key].value = secrets[key].skipMultilineEncoding
          ? formatMultiValueEnv(expandedSec[key])
          : expandedSec[key];
        // eslint-disable-next-line
        continue;
      }

      // this is to avoid recursion loop. So the graph should be direct graph rather than cyclic
      // so for any recursion building if there is an entity two times same key meaning it will be looped
      const recursionChainBreaker: Record<string, boolean> = {};
      const expandedVal = await recursivelyExpandSecret(
        expandedSec,
        interpolatedSec,
        crossSecEnvFetch,
        recursionChainBreaker,
        key
      );

      // eslint-disable-next-line
      secrets[key].value = secrets[key].skipMultilineEncoding ? formatMultiValueEnv(expandedVal) : expandedVal;
    }

    return secrets;
  };
  return expandSecrets;
};

export const decryptSecretRaw = (
  secret: TSecrets & {
    workspace: string;
    environment: string;
    secretPath: string;
    tags?: {
      id: string;
      slug: string;
      color?: string | null;
      name: string;
    }[];
  },
  key: string
) => {
  const secretKey = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretKeyCiphertext,
    iv: secret.secretKeyIV,
    tag: secret.secretKeyTag,
    key
  });

  const secretValue = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretValueCiphertext,
    iv: secret.secretValueIV,
    tag: secret.secretValueTag,
    key
  });

  let secretComment = "";

  if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
    secretComment = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: secret.secretCommentCiphertext,
      iv: secret.secretCommentIV,
      tag: secret.secretCommentTag,
      key
    });
  }

  return {
    secretKey,
    secretPath: secret.secretPath,
    workspace: secret.workspace,
    environment: secret.environment,
    secretValue,
    secretComment,
    version: secret.version,
    type: secret.type,
    _id: secret.id,
    id: secret.id,
    user: secret.userId,
    tags: secret.tags,
    skipMultilineEncoding: secret.skipMultilineEncoding,
    secretReminderRepeatDays: secret.secretReminderRepeatDays,
    secretReminderNote: secret.secretReminderNote,
    metadata: secret.metadata,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt
  };
};

// this is used when secret blind index already exist
// mainly for secret approval
export const fnSecretBlindIndexCheckV2 = async ({
  inputSecrets,
  folderId,
  userId,
  secretDAL
}: TFnSecretBlindIndexCheckV2) => {
  if (inputSecrets.some(({ type }) => type === SecretType.Personal) && !userId) {
    throw new BadRequestError({ message: "Missing user id for personal secret" });
  }
  const secrets = await secretDAL.findByBlindIndexes(
    folderId,
    inputSecrets.map(({ secretBlindIndex, type }) => ({
      blindIndex: secretBlindIndex,
      type: type || SecretType.Shared
    })),
    userId
  );
  const secsGroupedByBlindIndex = groupBy(secrets, (i) => i.secretBlindIndex as string);

  return { secsGroupedByBlindIndex, secrets };
};

/**
 * Grabs and processes nested secret references from a string
 *
 * This function looks for patterns that match the interpolation syntax in the input string.
 * It filters out references that include nested paths, splits them into environment and
 * secret path parts, and then returns an array of objects with the environment and the
 * joined secret path.
 *
 * @param {string} maybeSecretReference - The string that has the potential secret references.
 * @returns {Array<{ environment: string, secretPath: string }>} - An array of objects
 * with the environment and joined secret path.
 *
 * @example
 * const value = "Hello ${dev.someFolder.OtherFolder.SECRET_NAME} and ${prod.anotherFolder.SECRET_NAME}";
 * const result = getAllNestedSecretReferences(value);
 * // result will be:
 * // [
 * //   { environment: 'dev', secretPath: '/someFolder/OtherFolder' },
 * //   { environment: 'prod', secretPath: '/anotherFolder' }
 * // ]
 */
export const getAllNestedSecretReferences = (maybeSecretReference: string) => {
  const references = Array.from(maybeSecretReference.matchAll(INTERPOLATION_SYNTAX_REG), (m) => m[1]);
  return references
    .filter((el) => el.includes("."))
    .map((el) => {
      const [environment, ...secretPathList] = el.split(".");
      return { environment, secretPath: path.join("/", ...secretPathList.slice(0, -1)) };
    });
};

/**
 * Checks and handles secrets using a blind index method.
 * The function generates mappings between secret names and their blind indexes, validates user IDs for personal secrets, and retrieves secrets from the database based on their blind indexes.
 * For new secrets (isNew = true), it ensures they don't already exist in the database.
 * For existing secrets, it verifies their presence in the database.
 * If discrepancies are found, errors are thrown. The function returns mappings and the fetched secrets.
 */
export const fnSecretBlindIndexCheck = async ({
  inputSecrets,
  folderId,
  isNew,
  userId,
  blindIndexCfg,
  secretDAL
}: TFnSecretBlindIndexCheck) => {
  const blindIndex2KeyName: Record<string, string> = {}; // used at audit log point
  const keyName2BlindIndex = await Promise.all(
    inputSecrets.map(({ secretName }) => generateSecretBlindIndexBySalt(secretName, blindIndexCfg))
  ).then((blindIndexes) =>
    blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
      // eslint-disable-next-line
      prev[inputSecrets[i].secretName] = curr;
      blindIndex2KeyName[curr] = inputSecrets[i].secretName;
      return prev;
    }, {})
  );

  if (inputSecrets.some(({ type }) => type === SecretType.Personal) && !userId) {
    throw new BadRequestError({ message: "Missing user id for personal secret" });
  }

  const secrets = await secretDAL.findByBlindIndexes(
    folderId,
    inputSecrets.map(({ secretName, type }) => ({
      blindIndex: keyName2BlindIndex[secretName],
      type: type || SecretType.Shared
    })),
    userId
  );

  if (isNew) {
    if (secrets.length) throw new BadRequestError({ message: "Secret already exist" });
  } else {
    const secretKeysInDB = unique(secrets, (el) => el.secretBlindIndex as string).map(
      (el) => blindIndex2KeyName[el.secretBlindIndex as string]
    );
    const hasUnknownSecretsProvided = secretKeysInDB.length !== inputSecrets.length;
    if (hasUnknownSecretsProvided) {
      const keysMissingInDB = Object.keys(keyName2BlindIndex).filter((key) => !secretKeysInDB.includes(key));
      throw new BadRequestError({
        message: `Secret not found: blind index ${keysMissingInDB.join(",")}`
      });
    }
  }

  return { blindIndex2KeyName, keyName2BlindIndex, secrets };
};

// these functions are special functions shared by a couple of resources
// used by secret approval, rotation or anywhere in which secret needs to modified
export const fnSecretBulkInsert = async ({
  // TODO: Pick types here
  folderId,
  inputSecrets,
  secretDAL,
  secretVersionDAL,
  secretTagDAL,
  secretVersionTagDAL,
  tx
}: TFnSecretBulkInsert) => {
  const sanitizedInputSecrets = inputSecrets.map(
    ({
      skipMultilineEncoding,
      type,
      userId,
      version,
      metadata,
      algorithm,
      secretKeyIV,
      secretKeyTag,
      secretValueIV,
      keyEncoding,
      secretValueTag,
      secretCommentIV,
      secretBlindIndex,
      secretCommentTag,
      secretKeyCiphertext,
      secretReminderNote,
      secretValueCiphertext,
      secretCommentCiphertext,
      secretReminderRepeatDays
    }) => ({
      skipMultilineEncoding,
      folderId,
      type,
      userId,
      version,
      metadata,
      algorithm,
      secretKeyIV,
      secretKeyTag,
      secretValueIV,
      keyEncoding,
      secretValueTag,
      secretCommentIV,
      secretBlindIndex,
      secretCommentTag,
      secretKeyCiphertext,
      secretReminderNote,
      secretValueCiphertext,
      secretCommentCiphertext,
      secretReminderRepeatDays
    })
  );
  const newSecrets = await secretDAL.insertMany(sanitizedInputSecrets, tx);
  const newSecretGroupByBlindIndex = groupBy(newSecrets, (item) => item.secretBlindIndex as string);
  const newSecretTags = inputSecrets.flatMap(({ tags: secretTags = [], secretBlindIndex }) =>
    secretTags.map((tag) => ({
      [`${TableName.SecretTag}Id` as const]: tag,
      [`${TableName.Secret}Id` as const]: newSecretGroupByBlindIndex[secretBlindIndex as string][0].id
    }))
  );
  const secretVersions = await secretVersionDAL.insertMany(
    sanitizedInputSecrets.map((el) => ({
      ...el,
      secretId: newSecretGroupByBlindIndex[el.secretBlindIndex as string][0].id
    })),
    tx
  );
  await secretDAL.upsertSecretReferences(
    inputSecrets.map(({ references = [], secretBlindIndex }) => ({
      secretId: newSecretGroupByBlindIndex[secretBlindIndex as string][0].id,
      references
    })),
    tx
  );
  if (newSecretTags.length) {
    const secTags = await secretTagDAL.saveTagsToSecret(newSecretTags, tx);
    const secVersionsGroupBySecId = groupBy(secretVersions, (i) => i.secretId);
    const newSecretVersionTags = secTags.flatMap(({ secretsId, secret_tagsId }) => ({
      [`${TableName.SecretVersion}Id` as const]: secVersionsGroupBySecId[secretsId][0].id,
      [`${TableName.SecretTag}Id` as const]: secret_tagsId
    }));
    await secretVersionTagDAL.insertMany(newSecretVersionTags, tx);
  }

  return newSecrets.map((secret) => ({ ...secret, _id: secret.id }));
};

export const fnSecretBulkUpdate = async ({
  tx,
  inputSecrets,
  folderId,
  projectId,
  secretDAL,
  secretVersionDAL,
  secretTagDAL,
  secretVersionTagDAL
}: TFnSecretBulkUpdate) => {
  const sanitizedInputSecrets = inputSecrets.map(
    ({
      filter,
      data: {
        skipMultilineEncoding,
        type,
        userId,
        metadata,
        algorithm,
        secretKeyIV,
        secretKeyTag,
        secretValueIV,
        keyEncoding,
        secretValueTag,
        secretCommentIV,
        secretBlindIndex,
        secretCommentTag,
        secretKeyCiphertext,
        secretReminderNote,
        secretValueCiphertext,
        secretCommentCiphertext,
        secretReminderRepeatDays
      }
    }) => ({
      filter: { ...filter, folderId },
      data: {
        skipMultilineEncoding,
        type,
        userId,
        metadata,
        algorithm,
        secretKeyIV,
        secretKeyTag,
        secretValueIV,
        keyEncoding,
        secretValueTag,
        secretCommentIV,
        secretBlindIndex,
        secretCommentTag,
        secretKeyCiphertext,
        secretReminderNote,
        secretValueCiphertext,
        secretCommentCiphertext,
        secretReminderRepeatDays
      }
    })
  );

  const newSecrets = await secretDAL.bulkUpdate(sanitizedInputSecrets, tx);
  const secretVersions = await secretVersionDAL.insertMany(
    newSecrets.map(({ id, createdAt, updatedAt, ...el }) => ({
      ...el,
      secretId: id
    })),
    tx
  );
  await secretDAL.upsertSecretReferences(
    inputSecrets
      .filter(({ data: { references } }) => Boolean(references))
      .map(({ data: { references = [] } }, i) => ({
        secretId: newSecrets[i].id,
        references
      })),
    tx
  );
  const secsUpdatedTag = inputSecrets.flatMap(({ data: { tags } }, i) =>
    tags !== undefined ? { tags, secretId: newSecrets[i].id } : []
  );
  if (secsUpdatedTag.length) {
    await secretTagDAL.deleteTagsManySecret(
      projectId,
      secsUpdatedTag.map(({ secretId }) => secretId),
      tx
    );
    const newSecretTags = secsUpdatedTag.flatMap(({ tags: secretTags = [], secretId }) =>
      secretTags.map((tag) => ({
        [`${TableName.SecretTag}Id` as const]: tag,
        [`${TableName.Secret}Id` as const]: secretId
      }))
    );
    if (newSecretTags.length) {
      const secTags = await secretTagDAL.saveTagsToSecret(newSecretTags, tx);
      const secVersionsGroupBySecId = groupBy(secretVersions, (i) => i.secretId);
      const newSecretVersionTags = secTags.flatMap(({ secretsId, secret_tagsId }) => ({
        [`${TableName.SecretVersion}Id` as const]: secVersionsGroupBySecId[secretsId][0].id,
        [`${TableName.SecretTag}Id` as const]: secret_tagsId
      }));
      await secretVersionTagDAL.insertMany(newSecretVersionTags, tx);
    }
  }

  return newSecrets.map((secret) => ({ ...secret, _id: secret.id }));
};

export const fnSecretBulkDelete = async ({
  folderId,
  inputSecrets,
  tx,
  actorId,
  secretDAL,
  secretQueueService
}: TFnSecretBulkDelete) => {
  const deletedSecrets = await secretDAL.deleteMany(
    inputSecrets.map(({ type, secretBlindIndex }) => ({
      blindIndex: secretBlindIndex,
      type
    })),
    folderId,
    actorId,
    tx
  );

  await Promise.allSettled(
    deletedSecrets
      .filter(({ secretReminderRepeatDays }) => Boolean(secretReminderRepeatDays))
      .map(({ id, secretReminderRepeatDays }) =>
        secretQueueService.removeSecretReminder({ secretId: id, repeatDays: secretReminderRepeatDays as number })
      )
  );

  return deletedSecrets;
};

export const createManySecretsRawFnFactory = ({
  projectDAL,
  projectBotDAL,
  secretDAL,
  secretVersionDAL,
  secretBlindIndexDAL,
  secretTagDAL,
  secretVersionTagDAL,
  folderDAL,
  secretVersionV2BridgeDAL,
  secretV2BridgeDAL,
  secretVersionTagV2BridgeDAL,
  kmsService
}: TCreateManySecretsRawFnFactory) => {
  const getBotKeyFn = getBotKeyFnFactory(projectBotDAL, projectDAL);
  const createManySecretsRawFn = async ({
    projectId,
    environment,
    path: secretPath,
    secrets,
    userId
  }: TCreateManySecretsRawFn) => {
    const { botKey, shouldUseSecretV2Bridge } = await getBotKeyFn(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;
    if (shouldUseSecretV2Bridge) {
      const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      const secretsStoredInDB = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        secrets.map((el) => ({
          key: el.secretName,
          type: SecretType.Shared
        }))
      );
      if (secretsStoredInDB.length)
        throw new BadRequestError({
          message: `Secret already exist: ${secretsStoredInDB.map((el) => el.key).join(",")}`
        });

      const inputSecrets = secrets.map((secret) => {
        return {
          type: secret.type,
          userId: secret.type === SecretType.Personal ? userId : null,
          key: secret.secretName,
          encryptedValue: secretManagerEncryptor({ plainText: Buffer.from(secret.secretValue) }).cipherTextBlob,
          encryptedComent: secret.secretComment
            ? secretManagerEncryptor({ plainText: Buffer.from(secret.secretComment) }).cipherTextBlob
            : null,
          skipMultilineEncoding: secret.skipMultilineEncoding,
          tags: secret.tags,
          references: getAllNestedSecretReferencesV2Bridge(secret.secretValue)
        };
      });

      // get all tags
      const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
      const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
      if (tags.length !== tagIds.length) throw new BadRequestError({ message: "Tag not found" });

      const newSecrets = await secretDAL.transaction(async (tx) =>
        fnSecretV2BridgeBulkInsert({
          inputSecrets: inputSecrets.map((el) => ({
            ...el,
            version: 1,
            tagIds: el.tags
          })),
          folderId,
          secretDAL: secretV2BridgeDAL,
          secretVersionDAL: secretVersionV2BridgeDAL,
          secretTagDAL,
          secretVersionTagDAL: secretVersionTagV2BridgeDAL,
          tx
        })
      );

      return newSecrets;
    }

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "Create secret" });

    // insert operation
    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: secrets,
      folderId,
      isNew: true,
      blindIndexCfg,
      userId,
      secretDAL
    });

    if (!botKey) throw new BadRequestError({ message: "Project bot not found", name: "bot_not_found_error" });
    const inputSecrets = secrets.map((secret) => {
      const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8(secret.secretName, botKey);
      const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8(secret.secretValue || "", botKey);
      const secretReferences = getAllNestedSecretReferences(secret.secretValue || "");
      const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8(secret.secretComment || "", botKey);

      return {
        type: secret.type,
        userId: secret.type === SecretType.Personal ? userId : null,
        secretName: secret.secretName,
        secretKeyCiphertext: secretKeyEncrypted.ciphertext,
        secretKeyIV: secretKeyEncrypted.iv,
        secretKeyTag: secretKeyEncrypted.tag,
        secretValueCiphertext: secretValueEncrypted.ciphertext,
        secretValueIV: secretValueEncrypted.iv,
        secretValueTag: secretValueEncrypted.tag,
        secretCommentCiphertext: secretCommentEncrypted.ciphertext,
        secretCommentIV: secretCommentEncrypted.iv,
        secretCommentTag: secretCommentEncrypted.tag,
        skipMultilineEncoding: secret.skipMultilineEncoding,
        tags: secret.tags,
        references: secretReferences
      };
    });

    // get all tags
    const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
    const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
    if (tags.length !== tagIds.length) throw new BadRequestError({ message: "Tag not found" });

    const newSecrets = await secretDAL.transaction(async (tx) =>
      fnSecretBulkInsert({
        inputSecrets: inputSecrets.map(({ secretName, tags: _, ...el }) => ({
          ...el,
          version: 0,
          secretBlindIndex: keyName2BlindIndex[secretName],
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.UTF8
        })),
        folderId,
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL,
        tx
      })
    );

    return newSecrets;
  };

  return createManySecretsRawFn;
};

export const updateManySecretsRawFnFactory = ({
  projectDAL,
  projectBotDAL,
  secretDAL,
  secretVersionDAL,
  secretBlindIndexDAL,
  secretTagDAL,
  secretVersionTagDAL,
  folderDAL,
  secretVersionTagV2BridgeDAL,
  secretVersionV2BridgeDAL,
  secretV2BridgeDAL,
  kmsService
}: TUpdateManySecretsRawFnFactory) => {
  const getBotKeyFn = getBotKeyFnFactory(projectBotDAL, projectDAL);
  const updateManySecretsRawFn = async ({
    projectId,
    environment,
    path: secretPath,
    secrets, // consider accepting instead ciphertext secrets
    userId
  }: TUpdateManySecretsRawFn): Promise<Array<{ id: string }>> => {
    const { botKey, shouldUseSecretV2Bridge } = await getBotKeyFn(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Update secret"
      });
    const folderId = folder.id;
    if (shouldUseSecretV2Bridge) {
      const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      const secretsToUpdate = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        secrets.map((el) => ({
          key: el.secretName,
          type: SecretType.Shared
        }))
      );
      if (secretsToUpdate.length !== secrets.length)
        throw new BadRequestError({ message: `Secret not exist: ${secretsToUpdate.map((el) => el.key).join(",")}` });

      // now find any secret that needs to update its name
      // same process as above
      const secretsWithNewName = secrets.filter(({ newSecretName }) => Boolean(newSecretName));
      if (secretsWithNewName.length) {
        const secretsWithNewNameInDB = await secretV2BridgeDAL.findBySecretKeys(
          folderId,
          secrets.map((el) => ({
            key: el.secretName,
            type: SecretType.Shared
          }))
        );
        if (secretsWithNewNameInDB.length)
          throw new BadRequestError({
            message: `Secret not exist: ${secretsWithNewName.map((el) => el.newSecretName).join(",")}`
          });
      }

      const secretsToUpdateInDBGroupedByKey = groupBy(secretsToUpdate, (i) => i.key);
      const inputSecrets = secrets.map((secret) => {
        if (secret.newSecretName === "") {
          throw new BadRequestError({ message: "New secret name cannot be empty" });
        }

        return {
          type: secret.type,
          userId: secret.type === SecretType.Personal ? userId : null,
          key: secret.newSecretName || secret.secretName,
          encryptedValue: secretManagerEncryptor({ plainText: Buffer.from(secret.secretValue) }).cipherTextBlob,
          encryptedComent: secret.secretComment
            ? secretManagerEncryptor({ plainText: Buffer.from(secret.secretComment) }).cipherTextBlob
            : null,
          skipMultilineEncoding: secret.skipMultilineEncoding,
          tags: secret.tags,
          references: getAllNestedSecretReferencesV2Bridge(secret.secretValue)
        };
      });

      const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
      const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
      if (tagIds.length !== tags.length) throw new BadRequestError({ message: "Tag not found" });

      const updatedSecrets = await secretDAL.transaction(async (tx) =>
        fnSecretV2BridgeBulkUpdate({
          folderId,
          tx,
          inputSecrets: inputSecrets.map((el) => ({
            filter: { id: secretsToUpdateInDBGroupedByKey[el.key][0].id, type: SecretType.Shared },
            data: el
          })),
          secretDAL: secretV2BridgeDAL,
          secretVersionDAL: secretVersionV2BridgeDAL,
          secretTagDAL,
          secretVersionTagDAL: secretVersionTagV2BridgeDAL
        })
      );

      return updatedSecrets;
    }

    if (!botKey) throw new BadRequestError({ message: "Project bot not found", name: "bot_not_found_error" });
    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: secrets,
      folderId,
      isNew: false,
      blindIndexCfg,
      secretDAL,
      userId
    });

    const inputSecrets = secrets.map((secret) => {
      if (secret.newSecretName === "") {
        throw new BadRequestError({ message: "New secret name cannot be empty" });
      }

      const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8(secret.secretName, botKey);
      const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8(secret.secretValue || "", botKey);
      const secretReferences = getAllNestedSecretReferences(secret.secretValue || "");
      const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8(secret.secretComment || "", botKey);

      return {
        type: secret.type,
        userId: secret.type === SecretType.Personal ? userId : null,
        secretName: secret.secretName,
        newSecretName: secret.newSecretName,
        secretKeyCiphertext: secretKeyEncrypted.ciphertext,
        secretKeyIV: secretKeyEncrypted.iv,
        secretKeyTag: secretKeyEncrypted.tag,
        secretValueCiphertext: secretValueEncrypted.ciphertext,
        secretValueIV: secretValueEncrypted.iv,
        secretValueTag: secretValueEncrypted.tag,
        secretCommentCiphertext: secretCommentEncrypted.ciphertext,
        secretCommentIV: secretCommentEncrypted.iv,
        secretCommentTag: secretCommentEncrypted.tag,
        skipMultilineEncoding: secret.skipMultilineEncoding,
        tags: secret.tags,
        references: secretReferences
      };
    });

    const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
    const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
    if (tagIds.length !== tags.length) throw new BadRequestError({ message: "Tag not found" });

    // now find any secret that needs to update its name
    // same process as above
    const nameUpdatedSecrets = inputSecrets.filter(({ newSecretName }) => Boolean(newSecretName));
    const { keyName2BlindIndex: newKeyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: nameUpdatedSecrets,
      folderId,
      isNew: true,
      blindIndexCfg,
      secretDAL
    });

    const updatedSecrets = await secretDAL.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId,
        projectId,
        tx,
        inputSecrets: inputSecrets.map(({ secretName, newSecretName, ...el }) => ({
          filter: { secretBlindIndex: keyName2BlindIndex[secretName], type: SecretType.Shared },
          data: {
            ...el,
            folderId,
            secretBlindIndex:
              newSecretName && newKeyName2BlindIndex[newSecretName]
                ? newKeyName2BlindIndex[newSecretName]
                : keyName2BlindIndex[secretName],
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.UTF8
          }
        })),
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL
      })
    );

    return updatedSecrets;
  };

  return updateManySecretsRawFn;
};

export const decryptSecretWithBot = (
  secret: Pick<
    TSecrets,
    | "secretKeyIV"
    | "secretKeyTag"
    | "secretKeyCiphertext"
    | "secretValueIV"
    | "secretValueTag"
    | "secretValueCiphertext"
    | "secretCommentIV"
    | "secretCommentTag"
    | "secretCommentCiphertext"
  >,
  key: string
) => {
  const secretKey = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretKeyCiphertext,
    iv: secret.secretKeyIV,
    tag: secret.secretKeyTag,
    key
  });

  const secretValue = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretValueCiphertext,
    iv: secret.secretValueIV,
    tag: secret.secretValueTag,
    key
  });

  let secretComment = "";

  if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
    secretComment = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: secret.secretCommentCiphertext,
      iv: secret.secretCommentIV,
      tag: secret.secretCommentTag,
      key
    });
  }

  return {
    secretKey,
    secretValue,
    secretComment
  };
};
