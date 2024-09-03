import path from "node:path";

import { TableName, TSecretFolders, TSecretsV2 } from "@app/db/schemas";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";
import { TFnSecretBulkDelete, TFnSecretBulkInsert, TFnSecretBulkUpdate } from "./secret-v2-bridge-types";

const INTERPOLATION_SYNTAX_REG = /\${([^}]+)}/g;

export const shouldUseSecretV2Bridge = (version: number) => version === 3;

/**
 * Grabs and processes nested secret references from a string
 *
 * This function looks for patterns that match the interpolation syntax in the input string.
 * It filters out references that include nested paths, splits them into environment and
 * secret path parts, and then returns an array of objects with the environment and the
 * joined secret path.
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
      return {
        environment,
        secretPath: path.join("/", ...secretPathList.slice(0, -1)),
        secretKey: secretPathList[secretPathList.length - 1]
      };
    });
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
      key,
      userId,
      encryptedComment,
      version,
      metadata,
      reminderNote,
      encryptedValue,
      reminderRepeatDays
    }) => ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      metadata,
      reminderNote,
      encryptedValue,
      reminderRepeatDays
    })
  );

  const newSecrets = await secretDAL.insertMany(sanitizedInputSecrets.map((el) => ({ ...el, folderId })));
  const newSecretGroupedByKeyName = groupBy(newSecrets, (item) => item.key);
  const newSecretTags = inputSecrets.flatMap(({ tagIds: secretTags = [], key }) =>
    secretTags.map((tag) => ({
      [`${TableName.SecretTag}Id` as const]: tag,
      [`${TableName.SecretV2}Id` as const]: newSecretGroupedByKeyName[key][0].id
    }))
  );
  const secretVersions = await secretVersionDAL.insertMany(
    sanitizedInputSecrets.map((el) => ({
      ...el,
      folderId,
      secretId: newSecretGroupedByKeyName[el.key][0].id
    })),
    tx
  );
  await secretDAL.upsertSecretReferences(
    inputSecrets.map(({ references = [], key }) => ({
      secretId: newSecretGroupedByKeyName[key][0].id,
      references
    })),
    tx
  );
  if (newSecretTags.length) {
    const secTags = await secretTagDAL.saveTagsToSecretV2(newSecretTags, tx);
    const secVersionsGroupBySecId = groupBy(secretVersions, (i) => i.secretId);
    const newSecretVersionTags = secTags.flatMap(({ secrets_v2Id, secret_tagsId }) => ({
      [`${TableName.SecretVersionV2}Id` as const]: secVersionsGroupBySecId[secrets_v2Id][0].id,
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
        key,
        encryptedValue,
        userId,
        encryptedComment,
        metadata,
        reminderNote,
        reminderRepeatDays
      }
    }) => ({
      filter: { ...filter, folderId },
      data: {
        skipMultilineEncoding,
        type,
        key,
        userId,
        encryptedComment,
        metadata,
        reminderNote,
        encryptedValue,
        reminderRepeatDays
      }
    })
  );

  const newSecrets = await secretDAL.bulkUpdate(sanitizedInputSecrets, tx);
  const secretVersions = await secretVersionDAL.insertMany(
    newSecrets.map(
      ({
        skipMultilineEncoding,
        type,
        key,
        userId,
        encryptedComment,
        version,
        metadata,
        reminderNote,
        encryptedValue,
        reminderRepeatDays,
        id: secretId
      }) => ({
        skipMultilineEncoding,
        type,
        key,
        userId,
        encryptedComment,
        version,
        metadata,
        reminderNote,
        encryptedValue,
        reminderRepeatDays,
        folderId,
        secretId
      })
    ),
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
    await secretTagDAL.deleteTagsToSecretV2(
      { $in: { secrets_v2Id: secsUpdatedTag.map(({ secretId }) => secretId) } },
      tx
    );
    const newSecretTags = secsUpdatedTag.flatMap(({ tags: secretTags = [], secretId }) =>
      secretTags.map((tag) => ({
        [`${TableName.SecretTag}Id` as const]: tag,
        [`${TableName.SecretV2}Id` as const]: secretId
      }))
    );
    if (newSecretTags.length) {
      const secTags = await secretTagDAL.saveTagsToSecretV2(newSecretTags, tx);
      const secVersionsGroupBySecId = groupBy(secretVersions, (i) => i.secretId);
      const newSecretVersionTags = secTags.flatMap(({ secrets_v2Id, secret_tagsId }) => ({
        [`${TableName.SecretVersionV2}Id` as const]: secVersionsGroupBySecId[secrets_v2Id][0].id,
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
    inputSecrets.map(({ type, secretKey }) => ({
      key: secretKey,
      type
    })),
    folderId,
    actorId,
    tx
  );

  await Promise.allSettled(
    deletedSecrets
      .filter(({ reminderRepeatDays }) => Boolean(reminderRepeatDays))
      .map(({ id, reminderRepeatDays }) =>
        secretQueueService.removeSecretReminder({ secretId: id, repeatDays: reminderRepeatDays as number })
      )
  );

  return deletedSecrets;
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

type TRecursivelyFetchSecretsFromFoldersArg = {
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectId: string;
  environment: string;
  currentPath: string;
  hasAccess: (environment: string, secretPath: string) => boolean;
};

export const recursivelyGetSecretPaths = async ({
  folderDAL,
  projectEnvDAL,
  projectId,
  environment,
  currentPath,
  hasAccess
}: TRecursivelyFetchSecretsFromFoldersArg) => {
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

  // Filter out paths that the user does not have permission to access, and paths that are not in the current path
  const allowedPaths = paths.filter(
    (folder) => hasAccess(environment, folder.path) && folder.path.startsWith(currentPath === "/" ? "" : currentPath)
  );

  return allowedPaths;
};
// used to convert multi line ones to quotes ones with \n
const formatMultiValueEnv = (val?: string) => {
  if (!val) return "";
  if (!val.match("\n")) return val;
  return `"${val.replace(/\n/g, "\\n")}"`;
};

type TInterpolateSecretArg = {
  projectId: string;
  decryptSecretValue: (encryptedValue?: Buffer | null) => string | undefined;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "findByFolderId">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
};

const MAX_SECRET_REFERENCE_DEPTH = 10;
export const expandSecretReferencesFactory = ({
  projectId,
  decryptSecretValue: decryptSecret,
  secretDAL,
  folderDAL
}: TInterpolateSecretArg) => {
  const secretCache: Record<string, Record<string, string>> = {};
  const getCacheUniqueKey = (environment: string, secretPath: string) => `${environment}-${secretPath}`;

  const fetchSecret = async (environment: string, secretPath: string, secretKey: string) => {
    const cacheKey = getCacheUniqueKey(environment, secretPath);

    if (secretCache?.[cacheKey]) {
      return secretCache[cacheKey][secretKey] || "";
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return "";
    const secrets = await secretDAL.findByFolderId(folder.id);

    const decryptedSecret = secrets.reduce<Record<string, string>>((prev, secret) => {
      // eslint-disable-next-line no-param-reassign
      prev[secret.key] = decryptSecret(secret.encryptedValue) || "";
      return prev;
    }, {});

    secretCache[cacheKey] = decryptedSecret;

    return secretCache[cacheKey][secretKey] || "";
  };

  const recursivelyExpandSecret = async (dto: { value?: string; secretPath: string; environment: string }) => {
    if (!dto.value) return "";

    const stack = [{ ...dto, depth: 0 }];
    let expandedValue = dto.value;

    while (stack.length) {
      const { value, secretPath, environment, depth } = stack.pop()!;
      // eslint-disable-next-line no-continue
      if (depth > MAX_SECRET_REFERENCE_DEPTH) continue;
      const refs = value?.match(INTERPOLATION_SYNTAX_REG);

      if (refs) {
        for (const interpolationSyntax of refs) {
          const interpolationKey = interpolationSyntax.slice(2, interpolationSyntax.length - 1);
          const entities = interpolationKey.trim().split(".");

          // eslint-disable-next-line no-continue
          if (!entities.length) continue;

          if (entities.length === 1) {
            const [secretKey] = entities;

            // eslint-disable-next-line no-continue,no-await-in-loop
            const referedValue = await fetchSecret(environment, secretPath, secretKey);
            const cacheKey = getCacheUniqueKey(environment, secretPath);
            secretCache[cacheKey][secretKey] = referedValue;
            if (INTERPOLATION_SYNTAX_REG.test(referedValue)) {
              stack.push({
                value: referedValue,
                secretPath,
                environment,
                depth: depth + 1
              });
            }
            expandedValue = expandedValue.replaceAll(interpolationSyntax, referedValue);
          } else {
            const secretReferenceEnvironment = entities[0];
            const secretReferencePath = path.join("/", ...entities.slice(1, entities.length - 1));
            const secretReferenceKey = entities[entities.length - 1];

            // eslint-disable-next-line no-await-in-loop
            const referedValue = await fetchSecret(secretReferenceEnvironment, secretReferencePath, secretReferenceKey);
            const cacheKey = getCacheUniqueKey(secretReferenceEnvironment, secretReferencePath);
            secretCache[cacheKey][secretReferenceKey] = referedValue;
            if (INTERPOLATION_SYNTAX_REG.test(referedValue)) {
              stack.push({
                value: referedValue,
                secretPath: secretReferencePath,
                environment: secretReferenceEnvironment,
                depth: depth + 1
              });
            }

            expandedValue = expandedValue.replaceAll(interpolationSyntax, referedValue);
          }
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

    const shouldExpand = Boolean(inputSecret.value?.match(INTERPOLATION_SYNTAX_REG));
    if (!shouldExpand) return inputSecret.value;

    const expandedSecretValue = await recursivelyExpandSecret(inputSecret);
    return inputSecret.skipMultilineEncoding ? formatMultiValueEnv(expandedSecretValue) : expandedSecretValue;
  };
  return expandSecret;
};

export const reshapeBridgeSecret = (
  workspaceId: string,
  environment: string,
  secretPath: string,
  secret: Omit<TSecretsV2, "encryptedValue" | "encryptedComment"> & {
    value: string;
    comment: string;
    tags?: {
      id: string;
      slug: string;
      color?: string | null;
      name: string;
    }[];
  }
) => ({
  secretKey: secret.key,
  secretPath,
  workspace: workspaceId,
  environment,
  secretValue: secret.value || "",
  secretComment: secret.comment || "",
  version: secret.version,
  type: secret.type,
  _id: secret.id,
  id: secret.id,
  user: secret.userId,
  tags: secret.tags,
  skipMultilineEncoding: secret.skipMultilineEncoding,
  secretReminderRepeatDays: secret.reminderRepeatDays,
  secretReminderNote: secret.reminderNote,
  metadata: secret.metadata,
  createdAt: secret.createdAt,
  updatedAt: secret.updatedAt
});
