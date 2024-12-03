import path from "node:path";

import { TableName, TSecretFolders, TSecretsV2 } from "@app/db/schemas";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";
import { TFnSecretBulkDelete, TFnSecretBulkInsert, TFnSecretBulkUpdate } from "./secret-v2-bridge-types";

const INTERPOLATION_SYNTAX_REG = /\${([a-zA-Z0-9-_.]+)}/g;
// akhilmhdh: JS regex with global save state in .test
const INTERPOLATION_SYNTAX_REG_NON_GLOBAL = /\${([a-zA-Z0-9-_.]+)}/;

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
export const getAllSecretReferences = (maybeSecretReference: string) => {
  const references = Array.from(maybeSecretReference.matchAll(INTERPOLATION_SYNTAX_REG), (m) => m[1]);

  const nestedReferences = references
    .filter((el) => el.includes("."))
    .map((el) => {
      const [environment, ...secretPathList] = el.split(".");
      return {
        environment,
        secretPath: path.join("/", ...secretPathList.slice(0, -1)),
        secretKey: secretPathList[secretPathList.length - 1]
      };
    });
  const localReferences = references.filter((el) => !el.includes("."));
  return { nestedReferences, localReferences };
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

  const newSecrets = await secretDAL.insertMany(
    sanitizedInputSecrets.map((el) => ({ ...el, folderId })),
    tx
  );
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
};

export const recursivelyGetSecretPaths = async ({
  folderDAL,
  projectEnvDAL,
  projectId,
  environment,
  currentPath
}: TRecursivelyFetchSecretsFromFoldersArg) => {
  const env = await projectEnvDAL.findOne({
    projectId,
    slug: environment
  });

  if (!env) {
    throw new NotFoundError({
      message: `Environment with slug '${environment}' in project with ID ${projectId} not found`
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

  // path relative will start with ../ if its outside directory
  const pathsInCurrentDirectory = paths.filter((folder) => !path.relative(currentPath, folder.path).startsWith(".."));

  return pathsInCurrentDirectory;
};
// used to convert multi line ones to quotes ones with \n
const formatMultiValueEnv = (val?: string) => {
  if (!val) return "";
  if (!val.match("\n")) return val;
  return `"${val.replace(/\n/g, "\\n")}"`;
};

type TSecretReferenceTraceNode = {
  key: string;
  value?: string;
  environment: string;
  secretPath: string;
  children: TSecretReferenceTraceNode[];
};
type TInterpolateSecretArg = {
  projectId: string;
  decryptSecretValue: (encryptedValue?: Buffer | null) => string | undefined;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "findByFolderId">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  canExpandValue: (environment: string, secretPath: string, secretName: string, secretTagSlugs: string[]) => boolean;
};

const MAX_SECRET_REFERENCE_DEPTH = 10;
export const expandSecretReferencesFactory = ({
  projectId,
  decryptSecretValue: decryptSecret,
  secretDAL,
  folderDAL,
  canExpandValue
}: TInterpolateSecretArg) => {
  const secretCache: Record<string, Record<string, { value: string; tags: string[] }>> = {};
  const getCacheUniqueKey = (environment: string, secretPath: string) => `${environment}-${secretPath}`;

  const fetchSecret = async (environment: string, secretPath: string, secretKey: string) => {
    const cacheKey = getCacheUniqueKey(environment, secretPath);

    if (secretCache?.[cacheKey]) {
      return secretCache[cacheKey][secretKey] || { value: "", tags: [] };
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return { value: "", tags: [] };
    const secrets = await secretDAL.findByFolderId(folder.id);

    const decryptedSecret = secrets.reduce<Record<string, { value: string; tags: string[] }>>((prev, secret) => {
      // eslint-disable-next-line no-param-reassign
      prev[secret.key] = { value: decryptSecret(secret.encryptedValue) || "", tags: secret.tags?.map((el) => el.slug) };
      return prev;
    }, {});

    secretCache[cacheKey] = decryptedSecret;

    return secretCache[cacheKey][secretKey] || { value: "", tags: [] };
  };

  const recursivelyExpandSecret = async (dto: {
    value?: string;
    secretPath: string;
    environment: string;
    shouldStackTrace?: boolean;
  }) => {
    const stackTrace = { ...dto, key: "root", children: [] } as TSecretReferenceTraceNode;

    if (!dto.value) return { expandedValue: "", stackTrace };
    const stack = [{ ...dto, depth: 0, trace: stackTrace }];
    let expandedValue = dto.value;

    while (stack.length) {
      const { value, secretPath, environment, depth, trace } = stack.pop()!;

      // eslint-disable-next-line no-continue
      if (depth > MAX_SECRET_REFERENCE_DEPTH) continue;
      const refs = value?.match(INTERPOLATION_SYNTAX_REG);

      if (refs) {
        for (const interpolationSyntax of refs) {
          const interpolationKey = interpolationSyntax.slice(2, interpolationSyntax.length - 1);
          const entities = interpolationKey.trim().split(".");

          // eslint-disable-next-line no-continue
          if (!entities.length) continue;

          let referencedSecretPath = "";
          let referencedSecretKey = "";
          let referencedSecretEnvironmentSlug = "";
          let referencedSecretValue = "";

          if (entities.length === 1) {
            const [secretKey] = entities;

            // eslint-disable-next-line no-continue,no-await-in-loop
            const referredValue = await fetchSecret(environment, secretPath, secretKey);
            if (!canExpandValue(environment, secretPath, secretKey, referredValue.tags))
              throw new ForbiddenRequestError({
                message: `You are attempting to reference secret named ${secretKey} from environment ${environment} in path ${secretPath} which you do not have access to.`
              });

            const cacheKey = getCacheUniqueKey(environment, secretPath);
            secretCache[cacheKey][secretKey] = referredValue;

            referencedSecretValue = referredValue.value;
            referencedSecretKey = secretKey;
            referencedSecretPath = secretPath;
            referencedSecretEnvironmentSlug = environment;
          } else {
            const secretReferenceEnvironment = entities[0];
            const secretReferencePath = path.join("/", ...entities.slice(1, entities.length - 1));
            const secretReferenceKey = entities[entities.length - 1];

            // eslint-disable-next-line no-await-in-loop
            const referedValue = await fetchSecret(secretReferenceEnvironment, secretReferencePath, secretReferenceKey);
            if (!canExpandValue(secretReferenceEnvironment, secretReferencePath, secretReferenceKey, referedValue.tags))
              throw new ForbiddenRequestError({
                message: `You are attempting to reference secret named ${secretReferenceKey} from environment ${secretReferenceEnvironment} in path ${secretReferencePath} which you do not have access to.`
              });

            const cacheKey = getCacheUniqueKey(secretReferenceEnvironment, secretReferencePath);
            secretCache[cacheKey][secretReferenceKey] = referedValue;

            referencedSecretValue = referedValue.value;
            referencedSecretKey = secretReferenceKey;
            referencedSecretPath = secretReferencePath;
            referencedSecretEnvironmentSlug = secretReferenceEnvironment;
          }

          const node = {
            value: referencedSecretValue,
            secretPath: referencedSecretPath,
            environment: referencedSecretEnvironmentSlug,
            depth: depth + 1,
            trace
          };

          const shouldExpandMore = INTERPOLATION_SYNTAX_REG_NON_GLOBAL.test(referencedSecretValue);
          if (dto.shouldStackTrace) {
            const stackTraceNode = { ...node, children: [], key: referencedSecretKey, trace: null };
            trace?.children.push(stackTraceNode);
            // if stack trace this would be child node
            if (shouldExpandMore) {
              stack.push({ ...node, trace: stackTraceNode });
            }
          } else if (shouldExpandMore) {
            // if no stack trace is needed we just keep going with root node
            stack.push(node);
          }

          if (referencedSecretValue) {
            expandedValue = expandedValue.replaceAll(
              interpolationSyntax,
              () => referencedSecretValue // prevents special characters from triggering replacement patterns
            );
          }
        }
      }
    }

    return { expandedValue, stackTrace };
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

    const { expandedValue } = await recursivelyExpandSecret(inputSecret);

    return inputSecret.skipMultilineEncoding ? formatMultiValueEnv(expandedValue) : expandedValue;
  };

  const getExpandedSecretStackTrace = async (inputSecret: {
    value?: string;
    secretPath: string;
    environment: string;
  }) => {
    const { stackTrace, expandedValue } = await recursivelyExpandSecret({ ...inputSecret, shouldStackTrace: true });
    return { stackTrace, expandedValue };
  };

  return { expandSecretReferences: expandSecret, getExpandedSecretStackTrace };
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
