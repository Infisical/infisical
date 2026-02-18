import path from "node:path";

import RE2 from "re2";

import { ForbiddenRequestError } from "@app/lib/errors";

import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";

const INTERPOLATION_PATTERN_STRING = String.raw`\${([a-zA-Z0-9-_.]+)}`;
const INTERPOLATION_TEST_REGEX = new RE2(INTERPOLATION_PATTERN_STRING);

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
  const references = [];
  let match;

  const regex = new RE2(INTERPOLATION_PATTERN_STRING, "g");
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(maybeSecretReference)) !== null) {
    references.push(match[1]);
  }

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

// used to convert multi line ones to quotes ones with \n
const formatMultiValueEnv = (val?: string) => {
  if (!val) return "";
  if (!val.match("\n")) return val;
  return `"${val.replaceAll("\n", "\\n")}"`;
};

export type TSecretReferenceTraceNode = {
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
  // When provided, personal secret overrides for this user will be preferred
  // over shared secrets when resolving references during expansion.
  userId?: string;
};

const MAX_SECRET_REFERENCE_DEPTH = 10;
export const expandSecretReferencesFactory = ({
  projectId,
  decryptSecretValue: decryptSecret,
  secretDAL,
  folderDAL,
  canExpandValue,
  userId
}: TInterpolateSecretArg) => {
  const secretCache: Record<string, Record<string, { value: string; tags: string[] }>> = {};
  const getCacheUniqueKey = (environment: string, secretPath: string) => `${environment}-${secretPath}`;

  const fetchSecret = async (environment: string, secretPath: string, secretKey: string) => {
    const cacheKey = getCacheUniqueKey(environment, secretPath);

    if (secretCache?.[cacheKey]) {
      return secretCache[cacheKey][secretKey] || { value: "", tags: [] };
    }

    try {
      const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
      if (!folder) return { value: "", tags: [] };
      // When userId is provided, findByFolderId returns both shared and personal secrets.
      // Personal overrides will take precedence over shared secrets in the reduce below.
      const secrets = await secretDAL.findByFolderId({ folderId: folder.id, userId });

      const decryptedSecret = secrets.reduce<Record<string, { value: string; tags: string[] }>>((prev, secret) => {
        // When userId is set, personal overrides (userId !== null) should take precedence
        // over shared secrets for the same key. We skip overwriting if a personal override
        // is already stored and the current secret is a shared one.
        if (userId && prev[secret.key] && !secret.userId) {
          return prev;
        }

        // eslint-disable-next-line no-param-reassign
        prev[secret.key] = {
          value: decryptSecret(secret.encryptedValue) || "",
          tags: secret.tags?.map((el) => el.slug)
        };
        return prev;
      }, {});

      secretCache[cacheKey] = decryptedSecret;

      return secretCache[cacheKey][secretKey] || { value: "", tags: [] };
    } catch (error) {
      secretCache[cacheKey] = {};
      return { value: "", tags: [] };
    }
  };

  const recursivelyExpandSecret = async (dto: {
    value?: string;
    secretPath: string;
    environment: string;
    shouldStackTrace?: boolean;
    secretKey: string;
  }) => {
    const stackTrace = { ...dto, key: "root", children: [] } as TSecretReferenceTraceNode;

    if (!dto.value) return { expandedValue: "", stackTrace };

    // Track visited secrets to prevent circular references
    const createSecretId = (env: string, secretPath: string, key: string) => `${env}:${secretPath}:${key}`;

    const currentSecretId = createSecretId(dto.environment, dto.secretPath, dto.secretKey);
    const stack = [{ ...dto, depth: 0, trace: stackTrace, visitedSecrets: new Set<string>([currentSecretId]) }];
    let expandedValue = dto.value;

    while (stack.length) {
      const { value, secretPath, environment, depth, trace, visitedSecrets } = stack.pop()!;

      // eslint-disable-next-line no-continue
      if (depth > MAX_SECRET_REFERENCE_DEPTH) continue;

      const matchRegex = new RE2(INTERPOLATION_PATTERN_STRING, "g");
      const refs = [];
      let match;

      // eslint-disable-next-line no-cond-assign
      while ((match = matchRegex.exec(value || "")) !== null) {
        refs.push(match[0]);
      }

      if (refs.length > 0) {
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
                message: `You do not have permission to read secret '${secretKey}' in environment '${environment}' at path '${secretPath}', which is referenced by secret '${dto.secretKey}' in environment '${dto.environment}' at path '${dto.secretPath}'.`
              });

            const cacheKey = getCacheUniqueKey(environment, secretPath);
            if (!secretCache[cacheKey]) secretCache[cacheKey] = {};
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
                message: `You do not have permission to read secret '${secretReferenceKey}' in environment '${secretReferenceEnvironment}' at path '${secretReferencePath}', which is referenced by secret '${dto.secretKey}' in environment '${dto.environment}' at path '${dto.secretPath}'.`
              });

            const cacheKey = getCacheUniqueKey(secretReferenceEnvironment, secretReferencePath);
            if (!secretCache[cacheKey]) secretCache[cacheKey] = {};
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
            secretKey: referencedSecretKey,
            trace
          };

          // Check for circular reference
          const referencedSecretId = createSecretId(
            referencedSecretEnvironmentSlug,
            referencedSecretPath,
            referencedSecretKey
          );
          const isCircular = visitedSecrets.has(referencedSecretId);

          const newVisitedSecrets = new Set([...visitedSecrets, referencedSecretId]);

          const shouldExpandMore = INTERPOLATION_TEST_REGEX.test(referencedSecretValue) && !isCircular;
          if (dto.shouldStackTrace) {
            const stackTraceNode = { ...node, children: [], key: referencedSecretKey, trace: null };
            trace?.children.push(stackTraceNode);
            // if stack trace this would be child node
            if (shouldExpandMore) {
              stack.push({ ...node, trace: stackTraceNode, visitedSecrets: newVisitedSecrets });
            }
          } else if (shouldExpandMore) {
            // if no stack trace is needed we just keep going with root node
            stack.push({ ...node, visitedSecrets: newVisitedSecrets });
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
    secretKey: string;
  }) => {
    if (!inputSecret.value) return inputSecret.value;

    const shouldExpand = INTERPOLATION_TEST_REGEX.test(inputSecret.value);
    if (!shouldExpand) return inputSecret.value;

    const { expandedValue } = await recursivelyExpandSecret(inputSecret);

    return inputSecret.skipMultilineEncoding ? formatMultiValueEnv(expandedValue) : expandedValue;
  };

  const getExpandedSecretStackTrace = async (inputSecret: {
    value?: string;
    secretPath: string;
    environment: string;
    secretKey: string;
  }) => {
    const { stackTrace, expandedValue } = await recursivelyExpandSecret({ ...inputSecret, shouldStackTrace: true });
    return { stackTrace, expandedValue };
  };

  return { expandSecretReferences: expandSecret, getExpandedSecretStackTrace };
};
