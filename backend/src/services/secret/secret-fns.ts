/* eslint-disable no-await-in-loop */
import path from "path";
import RE2 from "re2";

import {
  ActionProjectType,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TableName
} from "@app/db/schemas/models";
import { TSecretBlindIndexes } from "@app/db/schemas/secret-blind-indexes";
import { TSecretFolders } from "@app/db/schemas/secret-folders";
import { TSecrets } from "@app/db/schemas/secrets";
import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { buildSecretBlindIndexFromName } from "@app/lib/crypto";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import {
  fnSecretBulkInsert as fnSecretV2BridgeBulkInsert,
  fnSecretBulkUpdate as fnSecretV2BridgeBulkUpdate,
  getAllSecretReferences
} from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { KmsDataKey } from "../kms/kms-types";
import { getBotKeyFnFactory } from "../project-bot/project-bot-fns";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TReminderServiceFactory } from "../reminder/reminder-types";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
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

export const INFISICAL_SECRET_VALUE_HIDDEN_MASK = "<hidden-by-infisical>";

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
      throw new NotFoundError({
        message: `Environment with slug '${environment}' in project with ID '${projectId}' not found`
      });
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

    const { permission } = await permissionService.getProjectPermission({
      actor: auth.actor,
      actorId: auth.actorId,
      projectId,
      actorAuthMethod: auth.actorAuthMethod,
      actorOrgId: auth.actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // Filter out paths that the user does not have permission to access, and paths that are not in the current path
    const allowedPaths = paths.filter(
      (folder) =>
        hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
          environment,
          secretPath: folder.path
        }) && folder.path.startsWith(currentPath === "/" ? "" : currentPath)
    );

    return allowedPaths;
  };

  return getPaths;
};

// used to convert multi line ones to quotes ones with \n
const formatMultiValueEnv = (val?: string) => {
  if (!val) return "";
  if (!val.match("\n")) return val;
  return `"${val.replaceAll("\n", "\\n")}"`;
};

type TInterpolateSecretArg = {
  projectId: string;
  secretEncKey: string;
  secretDAL: Pick<TSecretDALFactory, "findByFolderId">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
};

const MAX_SECRET_REFERENCE_DEPTH = 5;
const INTERPOLATION_PATTERN_STRING = String.raw`\${([a-zA-Z0-9-_.]+)}`;
const INTERPOLATION_TEST_REGEX = new RE2(INTERPOLATION_PATTERN_STRING);

export const interpolateSecrets = ({ projectId, secretEncKey, secretDAL, folderDAL }: TInterpolateSecretArg) => {
  const secretCache: Record<string, Record<string, string>> = {};
  const getCacheUniqueKey = (environment: string, secretPath: string) => `${environment}-${secretPath}`;

  const fetchSecret = async (environment: string, secretPath: string, secretKey: string) => {
    const cacheKey = getCacheUniqueKey(environment, secretPath);
    const uniqKey = `${environment}-${cacheKey}`;

    if (secretCache?.[uniqKey]) {
      return secretCache[uniqKey][secretKey] || "";
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return "";
    const secrets = await secretDAL.findByFolderId(folder.id);

    const decryptedSec = secrets.reduce<Record<string, string>>((prev, secret) => {
      const decryptedSecretKey = crypto.encryption().symmetric().decrypt({
        ciphertext: secret.secretKeyCiphertext,
        iv: secret.secretKeyIV,
        tag: secret.secretKeyTag,
        key: secretEncKey,
        keySize: SymmetricKeySize.Bits128
      });
      const decryptedSecretValue = crypto.encryption().symmetric().decrypt({
        ciphertext: secret.secretValueCiphertext,
        iv: secret.secretValueIV,
        tag: secret.secretValueTag,
        key: secretEncKey,
        keySize: SymmetricKeySize.Bits128
      });

      // eslint-disable-next-line
      prev[decryptedSecretKey] = decryptedSecretValue;
      return prev;
    }, {});

    secretCache[uniqKey] = decryptedSec;

    return secretCache[uniqKey][secretKey] || "";
  };

  const recursivelyExpandSecret = async ({
    value,
    secretPath,
    environment,
    depth = 0
  }: {
    value?: string;
    secretPath: string;
    environment: string;
    depth?: number;
  }) => {
    if (!value) return "";
    if (depth > MAX_SECRET_REFERENCE_DEPTH) return "";

    const refs = [];
    let match;
    const execRegex = new RE2(INTERPOLATION_PATTERN_STRING, "g");

    // eslint-disable-next-line no-cond-assign
    while ((match = execRegex.exec(value)) !== null) {
      refs.push(match[0]);
    }

    let expandedValue = value;
    if (refs.length > 0) {
      for (const interpolationSyntax of refs) {
        const interpolationKey = interpolationSyntax.slice(2, interpolationSyntax.length - 1);
        const entities = interpolationKey.trim().split(".");

        if (entities.length === 1) {
          const [secretKey] = entities;
          // eslint-disable-next-line
          let referenceValue = await fetchSecret(environment, secretPath, secretKey);
          if (INTERPOLATION_TEST_REGEX.test(referenceValue)) {
            // eslint-disable-next-line
            referenceValue = await recursivelyExpandSecret({
              environment,
              secretPath,
              value: referenceValue,
              depth: depth + 1
            });
          }
          const cacheKey = getCacheUniqueKey(environment, secretPath);
          secretCache[cacheKey][secretKey] = referenceValue;
          expandedValue = expandedValue.replaceAll(interpolationSyntax, referenceValue);
        }

        if (entities.length > 1) {
          const secretReferenceEnvironment = entities[0];
          const secretReferencePath = path.join("/", ...entities.slice(1, entities.length - 1));
          const secretReferenceKey = entities[entities.length - 1];

          // eslint-disable-next-line
          let referenceValue = await fetchSecret(secretReferenceEnvironment, secretReferencePath, secretReferenceKey);
          if (INTERPOLATION_TEST_REGEX.test(referenceValue)) {
            // eslint-disable-next-line
            referenceValue = await recursivelyExpandSecret({
              environment: secretReferenceEnvironment,
              secretPath: secretReferencePath,
              value: referenceValue,
              depth: depth + 1
            });
          }
          const cacheKey = getCacheUniqueKey(secretReferenceEnvironment, secretReferencePath);
          secretCache[cacheKey][secretReferenceKey] = referenceValue;
          expandedValue = expandedValue.replaceAll(interpolationSyntax, referenceValue);
        }
      }
    }

    return expandedValue;
  };

  const expandSecret = async (inputSecret: {
    value?: string;
    skipMultilineEncoding?: boolean | null;
    secretPath: string;
    environment: string;
  }) => {
    if (!inputSecret.value) return inputSecret.value;

    const shouldExpand = INTERPOLATION_TEST_REGEX.test(inputSecret.value);
    if (!shouldExpand) return inputSecret.value;

    const expandedSecretValue = await recursivelyExpandSecret(inputSecret);
    return inputSecret.skipMultilineEncoding ? formatMultiValueEnv(expandedSecretValue) : expandedSecretValue;
  };
  return expandSecret;
};

export const decryptSecretRaw = (
  secret: TSecrets & {
    secretValueHidden: boolean;
    workspace: string;
    environment: string;
    secretPath: string;
    tags?: {
      id: string;
      slug: string;
      color?: string | null;
    }[];
  },
  key: string
) => {
  const secretKey = crypto.encryption().symmetric().decrypt({
    ciphertext: secret.secretKeyCiphertext,
    iv: secret.secretKeyIV,
    tag: secret.secretKeyTag,
    key,
    keySize: SymmetricKeySize.Bits128
  });

  const secretValue = !secret.secretValueHidden
    ? crypto.encryption().symmetric().decrypt({
        ciphertext: secret.secretValueCiphertext,
        iv: secret.secretValueIV,
        tag: secret.secretValueTag,
        key,
        keySize: SymmetricKeySize.Bits128
      })
    : INFISICAL_SECRET_VALUE_HIDDEN_MASK;

  let secretComment = "";

  if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
    secretComment = crypto.encryption().symmetric().decrypt({
      ciphertext: secret.secretCommentCiphertext,
      iv: secret.secretCommentIV,
      tag: secret.secretCommentTag,
      key,
      keySize: SymmetricKeySize.Bits128
    });
  }

  return {
    secretKey,
    secretPath: secret.secretPath,
    workspace: secret.workspace,
    environment: secret.environment,
    secretValueHidden: secret.secretValueHidden,
    secretValue,
    secretComment,
    version: secret.version,
    type: secret.type,
    _id: secret.id,
    id: secret.id,
    user: secret.userId,
    tags: secret.tags?.map((el) => ({ ...el, name: el.slug })),
    secretReminderRecipients: [],
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
  const matches = [];
  let match;

  const execRegex = new RE2(INTERPOLATION_PATTERN_STRING, "g");

  // eslint-disable-next-line no-cond-assign
  while ((match = execRegex.exec(maybeSecretReference)) !== null) {
    matches.push(match);
  }

  const references = matches.map((m) => m[1]);

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
    if (secrets.length) throw new BadRequestError({ message: "Secret already exists" });
  } else {
    const secretKeysInDB = unique(secrets, (el) => el.secretBlindIndex as string).map(
      (el) => blindIndex2KeyName[el.secretBlindIndex as string]
    );
    const hasUnknownSecretsProvided = secretKeysInDB.length !== inputSecrets.length;
    if (hasUnknownSecretsProvided) {
      const keysMissingInDB = Object.keys(keyName2BlindIndex).filter((key) => !secretKeysInDB.includes(key));
      throw new NotFoundError({
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
  secretQueueService,
  projectId
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
        secretQueueService.removeSecretReminder(
          { secretId: id, repeatDays: secretReminderRepeatDays as number, projectId },
          tx
        )
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
  folderCommitService,
  kmsService,
  resourceMetadataDAL
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
    const project = await projectDAL.findById(projectId);
    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' not found in environment with slug '${environment}'`,
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
          message: `Secret already exists: ${secretsStoredInDB.map((el) => el.key).join(",")}`
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
          references: getAllSecretReferences(secret.secretValue).nestedReferences
        };
      });

      // get all tags
      const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
      const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
      if (tags.length !== tagIds.length) throw new NotFoundError({ message: "One or more tags not found" });

      const newSecrets = await secretDAL.transaction(async (tx) =>
        fnSecretV2BridgeBulkInsert({
          inputSecrets: inputSecrets.map((el) => ({
            ...el,
            version: 1,
            tagIds: el.tags
          })),
          folderId,
          orgId: project.orgId,
          secretDAL: secretV2BridgeDAL,
          resourceMetadataDAL,
          secretVersionDAL: secretVersionV2BridgeDAL,
          secretTagDAL,
          secretVersionTagDAL: secretVersionTagV2BridgeDAL,
          folderCommitService,
          tx
        })
      );

      return newSecrets;
    }

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new NotFoundError({ message: "Blind index not found", name: "Create secret" });

    // insert operation
    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: secrets,
      folderId,
      isNew: true,
      blindIndexCfg,
      userId,
      secretDAL
    });

    if (!botKey)
      throw new NotFoundError({
        message: `Project bot not found for project with ID '${projectId}'. Please upgrade your project.`,
        name: "bot_not_found_error"
      });

    const inputSecrets = secrets.map((secret) => {
      const secretKeyEncrypted = crypto.encryption().symmetric().encrypt({
        plaintext: secret.secretName,
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });
      const secretValueEncrypted = crypto
        .encryption()
        .symmetric()
        .encrypt({
          plaintext: secret.secretValue || "",
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });
      const secretReferences = getAllNestedSecretReferences(secret.secretValue || "");
      const secretCommentEncrypted = crypto
        .encryption()
        .symmetric()
        .encrypt({
          plaintext: secret.secretComment || "",
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });

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
    if (tags.length !== tagIds.length) throw new NotFoundError({ message: "One or more tags not found" });

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
  resourceMetadataDAL,
  folderCommitService,
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
    const project = await projectDAL.findById(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' not found in environment with slug '${environment}'`,
        name: "UpdateSecret"
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
        throw new NotFoundError({ message: `Secret does not exist: ${secretsToUpdate.map((el) => el.key).join(",")}` });

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
          throw new NotFoundError({
            message: `Secret does not exist: ${secretsWithNewName.map((el) => el.newSecretName).join(",")}`
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
          references: getAllSecretReferences(secret.secretValue).nestedReferences
        };
      });

      const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
      const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
      if (tagIds.length !== tags.length) throw new NotFoundError({ message: "One or more tags not found" });

      const updatedSecrets = await secretDAL.transaction(async (tx) =>
        fnSecretV2BridgeBulkUpdate({
          folderId,
          orgId: project.orgId,
          tx,
          inputSecrets: inputSecrets.map((el) => ({
            filter: { id: secretsToUpdateInDBGroupedByKey[el.key][0].id, type: SecretType.Shared },
            data: el
          })),
          resourceMetadataDAL,
          secretDAL: secretV2BridgeDAL,
          secretVersionDAL: secretVersionV2BridgeDAL,
          secretTagDAL,
          secretVersionTagDAL: secretVersionTagV2BridgeDAL,
          folderCommitService
        })
      );

      return updatedSecrets;
    }

    if (!botKey)
      throw new NotFoundError({
        message: `Project bot not found for project with ID '${projectId}'. Please upgrade your project.`,
        name: "bot_not_found_error"
      });
    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new NotFoundError({ message: "Blind index not found", name: "Update secret" });

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

      const secretKeyEncrypted = crypto.encryption().symmetric().encrypt({
        plaintext: secret.secretName,
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });
      const secretValueEncrypted = crypto
        .encryption()
        .symmetric()
        .encrypt({
          plaintext: secret.secretValue || "",
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });
      const secretReferences = getAllNestedSecretReferences(secret.secretValue || "");
      const secretCommentEncrypted = crypto
        .encryption()
        .symmetric()
        .encrypt({
          plaintext: secret.secretComment || "",
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });

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
    if (tagIds.length !== tags.length) throw new NotFoundError({ message: "One or more tags not found" });

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
  const secretKey = crypto.encryption().symmetric().decrypt({
    ciphertext: secret.secretKeyCiphertext,
    iv: secret.secretKeyIV,
    tag: secret.secretKeyTag,
    key,
    keySize: SymmetricKeySize.Bits128
  });

  const secretValue = crypto.encryption().symmetric().decrypt({
    ciphertext: secret.secretValueCiphertext,
    iv: secret.secretValueIV,
    tag: secret.secretValueTag,
    key,
    keySize: SymmetricKeySize.Bits128
  });

  let secretComment = "";

  if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
    secretComment = crypto.encryption().symmetric().decrypt({
      ciphertext: secret.secretCommentCiphertext,
      iv: secret.secretCommentIV,
      tag: secret.secretCommentTag,
      key,
      keySize: SymmetricKeySize.Bits128
    });
  }

  return {
    secretKey,
    secretValue,
    secretComment
  };
};

type TFnDeleteProjectSecretReminders = {
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  reminderService: Pick<TReminderServiceFactory, "deleteReminderBySecretId">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
};

export const fnDeleteProjectSecretReminders = async (
  projectId: string,
  { secretDAL, secretV2BridgeDAL, reminderService, projectBotService, folderDAL }: TFnDeleteProjectSecretReminders
) => {
  const projectFolders = await folderDAL.findByProjectId(projectId);
  const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId, false);

  const projectSecrets = shouldUseSecretV2Bridge
    ? await secretV2BridgeDAL.find({
        $in: { folderId: projectFolders.map((folder) => folder.id) },
        $notNull: ["reminderRepeatDays"]
      })
    : await secretDAL.find({
        $in: { folderId: projectFolders.map((folder) => folder.id) },
        $notNull: ["secretReminderRepeatDays"]
      });

  for await (const secret of projectSecrets) {
    const repeatDays = shouldUseSecretV2Bridge
      ? (secret as { reminderRepeatDays: number }).reminderRepeatDays
      : (secret as { secretReminderRepeatDays: number }).secretReminderRepeatDays;

    if (repeatDays) {
      await reminderService.deleteReminderBySecretId(secret.id, projectId);
    }
  }
};

export const conditionallyHideSecretValue = (
  shouldHideValue: boolean,
  {
    secretValueCiphertext,
    secretValueIV,
    secretValueTag
  }: {
    secretValueCiphertext: string;
    secretValueIV: string;
    secretValueTag: string;
  }
) => {
  return {
    secretValueCiphertext: shouldHideValue ? INFISICAL_SECRET_VALUE_HIDDEN_MASK : secretValueCiphertext,
    secretValueIV: shouldHideValue ? INFISICAL_SECRET_VALUE_HIDDEN_MASK : secretValueIV,
    secretValueTag: shouldHideValue ? INFISICAL_SECRET_VALUE_HIDDEN_MASK : secretValueTag,
    secretValueHidden: shouldHideValue
  };
};
