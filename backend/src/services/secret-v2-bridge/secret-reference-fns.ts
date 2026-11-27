import path from "node:path";

import { Knex } from "knex";
import RE2 from "re2";

import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import {
  BadRequestError,
  ClientClosedRequestError,
  ForbiddenRequestError,
  throwIfClientDisconnected
} from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectFolderGrantDALFactory } from "../project-folder-grant/project-folder-grant-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";

// Supports standard refs like ${ENV.path.KEY} and cross-project refs like ${@project-slug.ENV.path.KEY}.
// Secret names may contain spaces, but environment slugs and folder names cannot, so spaces are only
// accepted inside the final segment. Leading and trailing spaces are not, so `${ KEY }` stays literal as it
// always has rather than starting to resolve once trimmed.
const INTERPOLATION_PATTERN_STRING = String.raw`\${([a-zA-Z0-9-_.@]+(?: +[a-zA-Z0-9-_@]+)*)}`;
const INTERPOLATION_TEST_REGEX = new RE2(INTERPOLATION_PATTERN_STRING);

export const containsSecretReference = (value: string) => INTERPOLATION_TEST_REGEX.test(value);

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
  const uniqueReferences = new Set<string>();
  let match;

  const regex = new RE2(INTERPOLATION_PATTERN_STRING, "g");
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(maybeSecretReference)) !== null) {
    uniqueReferences.add(match[1]);
  }
  const references = [...uniqueReferences];

  const nestedReferences = references
    .filter((el) => el.includes("."))
    .map((el) => {
      const parts = el.split(".");
      // Cross-project reference: @project-slug.env.path.SECRET
      if (parts[0].startsWith("@")) {
        const [projectSlugWithAt, environment, ...rest] = parts;
        return {
          targetProjectSlug: projectSlugWithAt.slice(1),
          environment,
          secretPath: path.join("/", ...rest.slice(0, -1)),
          secretKey: rest[rest.length - 1]
        };
      }
      const [environment, ...secretPathList] = parts;
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
  // Present when this node references a secret from a different project
  projectSlug?: string;
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
  // Supplying all cross-project fields enables @project-slug.env.path.KEY refs.
  // Omit them for same-project-only expansion; cross-project refs then fail closed.
  actorOrgId?: string;
  orgDAL?: Pick<TOrgDALFactory, "findOrgById">;
  projectFolderGrantDAL?: Pick<TProjectFolderGrantDALFactory, "find">;
  projectDAL?: Pick<TProjectDALFactory, "find">;
  kmsDataKeyService?: TKmsDataKeyService;
  // Optional raw DAL for cross-project secret fetching. This is only distinct from
  // secretDAL when the caller wraps secretDAL with import-aware behavior for
  // same-project relative references; cross-project reads must stay raw so source
  // project imports are not resolved through the target project context.
  crossProjectSecretDAL?: Pick<TSecretV2BridgeDALFactory, "findByFolderId">;
  // Called once a secret's references expand without error, with the ids of the secrets in this project they
  // resolved to (a personal override included), so a caller can tell which secrets a read actually delivered.
  onSecretExpanded?: (
    secret: { environment: string; secretPath: string; secretKey: string },
    referencedSecretIds: string[]
  ) => void;
  abortSignal?: AbortSignal;
  tx?: Knex;
};

// A cross-project secret carries no id: only this project's secrets are reported to onSecretExpanded.
type TCachedReferencedSecret = { id?: string; value: string; tags: string[]; exists: boolean };

type TResolvedReference = {
  // Identifies the secret for circular reference checks and for reusing its expansion.
  nodeId: string;
  id?: string;
  key: string;
  environment: string;
  secretPath: string;
  projectSlug?: string;
  value: string;
  exists: boolean;
  isCrossProject: boolean;
};

type TExpandedValue = {
  value: string;
  // Every reference in the value's tree, counted the way the reference tree lists them.
  referenceCount: number;
  characterCount: number;
  referencedSecretIds: Set<string>;
  traceChildren: TSecretReferenceTraceNode[];
  // A value whose circular reference was cut short depends on which secrets referenced it, so it cannot be reused.
  isReusable: boolean;
};

export const MAX_SECRET_REFERENCE_DEPTH = 10;
// Both bound the expansion of one secret. References that point through each other multiply: a value holding many
// references to a secret that holds many references of its own costs the product of the two counts.
export const MAX_SECRET_REFERENCE_EXPANSION_REFERENCES = 1_000;
export const MAX_SECRET_REFERENCE_EXPANSION_CHARACTERS = 10 * 1024 * 1024;
// Counts every occurrence, so a reference repeated in one value counts each time. Well under the expansion limit, so
// a value that is accepted can still expand together with the references of the secrets it points to.
export const MAX_SECRET_REFERENCES_PER_VALUE = 100;

const exceedsReferenceOccurrences = (value: string, limit: number) => {
  const regex = new RE2(INTERPOLATION_PATTERN_STRING, "g");
  let occurrences = 0;
  // eslint-disable-next-line no-cond-assign
  while (regex.exec(value) !== null) {
    occurrences += 1;
    if (occurrences > limit) return true;
  }
  return false;
};

export const assertSecretReferencesWithinLimit = (secrets: { secretKey: string; secretValue?: string | null }[]) => {
  for (const { secretKey, secretValue } of secrets) {
    if (secretValue && exceedsReferenceOccurrences(secretValue, MAX_SECRET_REFERENCES_PER_VALUE)) {
      throw new BadRequestError({
        name: "SecretReferenceLimitExceeded",
        message: `The value of secret '${secretKey}' holds more than ${MAX_SECRET_REFERENCES_PER_VALUE.toLocaleString("en-US")} secret references, counting a reference each time it repeats. Reduce the references in it, or split it into several secrets.`
      });
    }
  }
};
export const expandSecretReferencesFactory = ({
  projectId,
  decryptSecretValue: decryptSecret,
  secretDAL,
  folderDAL,
  canExpandValue,
  userId,
  actorOrgId,
  orgDAL,
  projectFolderGrantDAL,
  projectDAL,
  kmsDataKeyService,
  crossProjectSecretDAL,
  onSecretExpanded,
  abortSignal,
  tx
}: TInterpolateSecretArg) => {
  const secretCache: Record<string, Record<string, TCachedReferencedSecret>> = {};
  let crossProjectAllowedCache: boolean | undefined;
  const hasCrossProjectConfig = Boolean(
    actorOrgId && orgDAL && projectFolderGrantDAL && projectDAL && kmsDataKeyService
  );
  const checkCrossProjectAllowed = async () => {
    if (!hasCrossProjectConfig || !actorOrgId || !orgDAL) return false;
    if (crossProjectAllowedCache !== undefined) return crossProjectAllowedCache;
    const org = await orgDAL.findOrgById(actorOrgId);
    crossProjectAllowedCache = org?.allowCrossProjectSecretSharing ?? false;
    return crossProjectAllowedCache;
  };
  const slugToProjectId = new Map<string, string | null>();
  const resolveProjectSlugs = async (slugs: string[]) => {
    if (!projectDAL || !actorOrgId) return;
    const uncached = slugs.filter((s) => !slugToProjectId.has(s));
    if (!uncached.length) return;

    const projects = await projectDAL.find({ orgId: actorOrgId, $in: { slug: uncached } });
    const found = new Map(projects.map((p) => [p.slug, p.id]));
    for (const s of uncached) {
      slugToProjectId.set(s, found.get(s) ?? null);
    }
  };
  const getProjectDecryptor = async (sourceProjectId: string) => {
    if (!kmsDataKeyService) return undefined;
    const { decryptor: sourceDecryptor } = await kmsDataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: sourceProjectId
    });
    return (value: Buffer | null | undefined) => (value ? sourceDecryptor({ cipherTextBlob: value }).toString() : "");
  };
  // Cache key includes project to avoid collisions between same-named envs across projects
  const getCacheUniqueKey = (environment: string, secretPath: string, srcProjectId?: string) =>
    srcProjectId ? `${srcProjectId}:${environment}-${secretPath}` : `${environment}-${secretPath}`;

  const pendingFolderLoads = new Map<string, Promise<void>>();

  const loadFolderSecrets = async (environment: string, secretPath: string, cacheKey: string) => {
    try {
      const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath, tx);
      if (!folder) return;
      throwIfClientDisconnected(abortSignal);
      // When userId is provided, findByFolderId returns both shared and personal secrets.
      // Personal overrides will take precedence over shared secrets in the reduce below.
      const secrets = await secretDAL.findByFolderId({ folderId: folder.id, userId, tx });
      throwIfClientDisconnected(abortSignal);

      const decryptedSecret = secrets.reduce<Record<string, TCachedReferencedSecret>>((prev, secret) => {
        // When userId is set, personal overrides (userId !== null) should take precedence
        // over shared secrets for the same key. We skip overwriting if a personal override
        // is already stored and the current secret is a shared one.
        if (userId && prev[secret.key] && !secret.userId) {
          return prev;
        }

        // eslint-disable-next-line no-param-reassign
        prev[secret.key] = {
          id: secret.id,
          value: decryptSecret(secret.encryptedValue) || "",
          tags: secret.tags?.map((el) => el.slug),
          exists: true
        };
        return prev;
      }, {});

      secretCache[cacheKey] = decryptedSecret;
    } catch (error) {
      // Rethrown so every expansion waiting on this shared load stops, rather than caching the folder as empty.
      if (error instanceof ClientClosedRequestError) throw error;
      secretCache[cacheKey] = {};
    }
  };

  const fetchSecret = async (
    environment: string,
    secretPath: string,
    secretKey: string
  ): Promise<TCachedReferencedSecret> => {
    const cacheKey = getCacheUniqueKey(environment, secretPath);

    if (!secretCache[cacheKey]) {
      let pending = pendingFolderLoads.get(cacheKey);
      if (!pending) {
        // Concurrent reference expansion must share the folder read before its result is cached.
        pending = loadFolderSecrets(environment, secretPath, cacheKey).finally(() => {
          pendingFolderLoads.delete(cacheKey);
        });
        pendingFolderLoads.set(cacheKey, pending);
      }
      await pending;
    }

    const secret = secretCache[cacheKey]?.[secretKey];
    return secret ? { ...secret } : { value: "", tags: [], exists: false };
  };

  // Shared by every secret this request expands. Keyed by depth as well, because the depth limit can cut short the
  // expansion of a secret reached deeper in the tree.
  const expandedValueCache = new Map<string, TExpandedValue>();

  const recursivelyExpandSecret = async (dto: {
    value?: string;
    secretPath: string;
    environment: string;
    shouldStackTrace?: boolean;
    secretKey: string;
    referencedSecretIds?: Set<string>;
  }) => {
    const stackTrace = { ...dto, key: "root", children: [] } as TSecretReferenceTraceNode;

    if (!dto.value) return { expandedValue: "", stackTrace };

    throwIfClientDisconnected(abortSignal);

    const createSecretId = (env: string, secretPath: string, key: string) => `${env}:${secretPath}:${key}`;

    // Ensure the secret can actually be read before we expand it
    const currentSecret = await fetchSecret(dto.environment, dto.secretPath, dto.secretKey);
    if (!canExpandValue(dto.environment, dto.secretPath, dto.secretKey, currentSecret.tags)) {
      throw new ForbiddenRequestError({
        message: `You do not have permission to read secret '${dto.secretKey}' in environment '${dto.environment}' at path '${dto.secretPath}'.`
      });
    }

    const crossProjectSecretSharingEnabled = await checkCrossProjectAllowed();

    const budget = { references: 0, characters: 0 };
    const throwExpansionTooLarge = (reason: string) => {
      throw new BadRequestError({
        name: "SecretReferenceExpansionTooLarge",
        message: `Unable to expand the references in secret '${dto.secretKey}' in environment '${dto.environment}' at path '${dto.secretPath}' because ${reason}. Reduce the references in this secret or in the secrets it references.`
      });
    };
    const chargeReferences = (count: number) => {
      budget.references += count;
      if (budget.references > MAX_SECRET_REFERENCE_EXPANSION_REFERENCES) {
        throwExpansionTooLarge(
          `it leads to more than ${MAX_SECRET_REFERENCE_EXPANSION_REFERENCES.toLocaleString("en-US")} references, counting the references inside the secrets it references`
        );
      }
    };
    const chargeCharacters = (count: number) => {
      budget.characters += count;
      if (budget.characters > MAX_SECRET_REFERENCE_EXPANSION_CHARACTERS) {
        throwExpansionTooLarge(
          `expanding it would process more than ${MAX_SECRET_REFERENCE_EXPANSION_CHARACTERS.toLocaleString("en-US")} characters`
        );
      }
    };

    // Returns undefined for a reference that stays literal without appearing in the reference tree.
    const resolveReference = async (
      interpolationSyntax: string,
      environment: string,
      secretPath: string
    ): Promise<TResolvedReference | undefined> => {
      const interpolationKey = interpolationSyntax.slice(2, interpolationSyntax.length - 1);
      const entities = interpolationKey.trim().split(".");

      if (!entities.length) return undefined;

      if (entities.length === 1) {
        const [secretKey] = entities;
        const referredValue = await fetchSecret(environment, secretPath, secretKey);
        if (!canExpandValue(environment, secretPath, secretKey, referredValue.tags))
          throw new ForbiddenRequestError({
            message: `You do not have permission to read secret '${secretKey}' in environment '${environment}' at path '${secretPath}', which is referenced by secret '${dto.secretKey}' in environment '${dto.environment}' at path '${dto.secretPath}'.`
          });

        const cacheKey = getCacheUniqueKey(environment, secretPath);
        if (!secretCache[cacheKey]) secretCache[cacheKey] = {};
        secretCache[cacheKey][secretKey] = referredValue;

        return {
          nodeId: createSecretId(environment, secretPath, secretKey),
          id: referredValue.id,
          key: secretKey,
          environment,
          secretPath,
          value: referredValue.value,
          exists: referredValue.exists,
          isCrossProject: false
        };
      }

      if (entities[0].startsWith("@")) {
        // Cross-project reference: ${@project-slug.env.path.KEY}
        if (!hasCrossProjectConfig || !projectFolderGrantDAL || !crossProjectSecretSharingEnabled) {
          return undefined;
        }

        const crossProjSlug = entities[0].slice(1);
        const crossProjEnv = entities[1];
        const crossProjPath = path.join("/", ...entities.slice(2, entities.length - 1));
        const crossProjKey = entities[entities.length - 1];

        const sourceProjectId = slugToProjectId.get(crossProjSlug) ?? null;
        if (!sourceProjectId) return undefined;

        const crossProjCacheKey = getCacheUniqueKey(crossProjEnv, crossProjPath, sourceProjectId);

        let crossProjSecretData: { value: string; tags: string[]; exists: boolean };
        if (secretCache?.[crossProjCacheKey]) {
          crossProjSecretData = secretCache[crossProjCacheKey][crossProjKey] || {
            value: "",
            tags: [],
            exists: false
          };
        } else {
          try {
            const sourceFolder = await folderDAL.findBySecretPath(sourceProjectId, crossProjEnv, crossProjPath, tx);
            throwIfClientDisconnected(abortSignal);
            if (!sourceFolder) {
              secretCache[crossProjCacheKey] = {};
              crossProjSecretData = { value: "", tags: [], exists: false };
            } else {
              // Verify that a folder grant exists: source folder → current target project
              const [grant] = await projectFolderGrantDAL.find({
                sourceProjectId,
                sourceFolderId: sourceFolder.id,
                targetProjectId: projectId
              });

              if (!grant) {
                secretCache[crossProjCacheKey] = {};
                crossProjSecretData = { value: "", tags: [], exists: false };
              } else {
                const sourceDecrypt = await getProjectDecryptor(sourceProjectId);
                if (!sourceDecrypt) {
                  secretCache[crossProjCacheKey] = {};
                  return undefined;
                }
                // Use the explicit raw DAL when same-project resolution wraps secretDAL
                // with import-aware behavior.
                const sourceSecrets = await (crossProjectSecretDAL || secretDAL).findByFolderId({
                  folderId: sourceFolder.id,
                  tx
                });
                throwIfClientDisconnected(abortSignal);

                const crossProjDecrypted = sourceSecrets.reduce<
                  Record<string, { value: string; tags: string[]; exists: boolean }>
                >((prev, secret) => {
                  // Only shared secrets (no personal overrides) from source project
                  if (!secret.userId) {
                    // eslint-disable-next-line no-param-reassign
                    prev[secret.key] = {
                      value: sourceDecrypt(secret.encryptedValue) || "",
                      tags: secret.tags?.map((el) => el.slug) || [],
                      exists: true
                    };
                  }
                  return prev;
                }, {});

                secretCache[crossProjCacheKey] = crossProjDecrypted;
                crossProjSecretData = crossProjDecrypted[crossProjKey] || { value: "", tags: [], exists: false };
              }
            }
          } catch (error) {
            if (error instanceof ClientClosedRequestError) throw error;
            logger.error(
              { err: error, crossProjSlug, crossProjEnv, crossProjPath, crossProjKey },
              `Failed to expand cross-project reference [slug=${crossProjSlug}] [env=${crossProjEnv}] [path=${crossProjPath}] [key=${crossProjKey}]`
            );
            secretCache[crossProjCacheKey] = {};
            crossProjSecretData = { value: "", tags: [], exists: false };
          }
        }

        return {
          nodeId: `@${sourceProjectId}:${createSecretId(crossProjEnv, crossProjPath, crossProjKey)}`,
          key: crossProjKey,
          environment: crossProjEnv,
          secretPath: crossProjPath,
          projectSlug: crossProjSlug,
          value: crossProjSecretData.value,
          exists: crossProjSecretData.exists,
          isCrossProject: true
        };
      }

      const secretReferenceEnvironment = entities[0];
      const secretReferencePath = path.join("/", ...entities.slice(1, entities.length - 1));
      const secretReferenceKey = entities[entities.length - 1];

      const referedValue = await fetchSecret(secretReferenceEnvironment, secretReferencePath, secretReferenceKey);
      if (!canExpandValue(secretReferenceEnvironment, secretReferencePath, secretReferenceKey, referedValue.tags))
        throw new ForbiddenRequestError({
          message: `You do not have permission to read secret '${secretReferenceKey}' in environment '${secretReferenceEnvironment}' at path '${secretReferencePath}', which is referenced by secret '${dto.secretKey}' in environment '${dto.environment}' at path '${dto.secretPath}'.`
        });

      const cacheKey = getCacheUniqueKey(secretReferenceEnvironment, secretReferencePath);
      if (!secretCache[cacheKey]) secretCache[cacheKey] = {};
      secretCache[cacheKey][secretReferenceKey] = referedValue;

      return {
        nodeId: createSecretId(secretReferenceEnvironment, secretReferencePath, secretReferenceKey),
        id: referedValue.id,
        key: secretReferenceKey,
        environment: secretReferenceEnvironment,
        secretPath: secretReferencePath,
        value: referedValue.value,
        exists: referedValue.exists,
        isCrossProject: false
      };
    };

    // eslint-disable-next-line prefer-const
    let expandReferencedValue: (
      reference: TResolvedReference,
      depth: number,
      ancestors: Set<string>
    ) => Promise<TExpandedValue>;

    // Each distinct reference in a value is resolved and expanded once, then every occurrence is replaced in a single
    // pass. A referenced value is expanded in its own environment and path before it is inserted.
    const expandValue = async ({
      value,
      environment,
      secretPath,
      secretKey,
      depth,
      ancestors
    }: {
      value: string;
      environment: string;
      secretPath: string;
      secretKey: string;
      depth: number;
      ancestors: Set<string>;
    }): Promise<TExpandedValue> => {
      const expanded: TExpandedValue = {
        value,
        referenceCount: 0,
        characterCount: 0,
        referencedSecretIds: new Set(),
        traceChildren: [],
        isReusable: true
      };

      if (depth > MAX_SECRET_REFERENCE_DEPTH) {
        expanded.isReusable = false;
        return expanded;
      }

      chargeCharacters(value.length);
      expanded.characterCount += value.length;

      const matchRegex = new RE2(INTERPOLATION_PATTERN_STRING, "g");
      const occurrences = new Map<string, number>();
      // A same-project reference always counts once resolved; a cross-project one may be skipped without counting.
      let sameProjectReferences = 0;
      let match;

      let occurrenceCount = 0;
      // eslint-disable-next-line no-cond-assign
      while ((match = matchRegex.exec(value)) !== null) {
        // Values stored before the write limit can repeat a reference hundreds of thousands of times; stopping here
        // keeps refusing one to a handful of matches instead of a scan over all of them.
        occurrenceCount += 1;
        if (occurrenceCount > MAX_SECRET_REFERENCE_EXPANSION_REFERENCES) {
          throwExpansionTooLarge(
            `the value of secret '${secretKey}' holds more than ${MAX_SECRET_REFERENCE_EXPANSION_REFERENCES.toLocaleString("en-US")} references`
          );
        }
        const count = occurrences.get(match[0]);
        occurrences.set(match[0], (count ?? 0) + 1);
        if (count === undefined && !match[1].startsWith("@")) {
          sameProjectReferences += 1;
          // Refused before any reference is resolved when the value alone holds more than the budget has left.
          if (budget.references + sameProjectReferences > MAX_SECRET_REFERENCE_EXPANSION_REFERENCES) {
            chargeReferences(sameProjectReferences);
          }
        }
      }

      const refs = [...occurrences.keys()];
      if (!refs.length) return expanded;

      // Batch-resolve all cross-project slugs from this value's refs in one query
      const crossProjectSlugs = refs
        .map((r) =>
          r
            .slice(2, r.length - 1)
            .trim()
            .split(".")
        )
        .filter((parts) => parts[0]?.startsWith("@"))
        .map((parts) => parts[0].slice(1));
      if (crossProjectSlugs.length > 0) {
        await resolveProjectSlugs(crossProjectSlugs);
      }

      const replacements = new Map<string, string>();
      for (const interpolationSyntax of refs) {
        throwIfClientDisconnected(abortSignal);

        // eslint-disable-next-line no-await-in-loop
        const reference = await resolveReference(interpolationSyntax, environment, secretPath);
        // eslint-disable-next-line no-continue
        if (!reference) continue;

        chargeReferences(1);
        expanded.referenceCount += 1;
        if (reference.id) expanded.referencedSecretIds.add(reference.id);

        const isCircular = ancestors.has(reference.nodeId);
        if (isCircular) expanded.isReusable = false;

        // Cross-project secrets are not recursively expanded (no source-project context in this factory)
        const shouldExpandMore =
          !isCircular && !reference.isCrossProject && INTERPOLATION_TEST_REGEX.test(reference.value);
        const child = shouldExpandMore
          ? // eslint-disable-next-line no-await-in-loop
            await expandReferencedValue(reference, depth + 1, ancestors)
          : undefined;

        if (child) {
          expanded.referenceCount += child.referenceCount;
          expanded.characterCount += child.characterCount;
          child.referencedSecretIds.forEach((id) => expanded.referencedSecretIds.add(id));
          if (!child.isReusable) expanded.isReusable = false;
        }

        if (dto.shouldStackTrace) {
          expanded.traceChildren.push({
            key: reference.key,
            value: reference.value,
            environment: reference.environment,
            secretPath: reference.secretPath,
            ...(reference.projectSlug ? { projectSlug: reference.projectSlug } : {}),
            children: child?.traceChildren ?? []
          });
        }

        // when the referenced secret does not exist, leave the literal ${REF} untouched
        if (reference.exists) replacements.set(interpolationSyntax, child?.value ?? reference.value);
      }

      if (replacements.size) {
        let expandedLength = value.length;
        replacements.forEach((replacement, interpolationSyntax) => {
          expandedLength +=
            (occurrences.get(interpolationSyntax) ?? 0) * (replacement.length - interpolationSyntax.length);
        });
        chargeCharacters(expandedLength);
        expanded.characterCount += expandedLength;

        // A replacer function inserts the value literally, so `$&` and similar patterns in it are not expanded
        expanded.value = value.replace(
          new RE2(INTERPOLATION_PATTERN_STRING, "g"),
          (interpolationSyntax: string) => replacements.get(interpolationSyntax) ?? interpolationSyntax
        );
      }

      return expanded;
    };

    expandReferencedValue = async (reference, depth, ancestors) => {
      const cacheKey = `${dto.shouldStackTrace ? "trace" : "value"}:${depth}:${reference.nodeId}`;
      const cached = expandedValueCache.get(cacheKey);
      if (cached) {
        chargeReferences(cached.referenceCount);
        chargeCharacters(cached.characterCount);
        return cached;
      }

      const expanded = await expandValue({
        value: reference.value,
        environment: reference.environment,
        secretPath: reference.secretPath,
        secretKey: reference.key,
        depth,
        ancestors: new Set(ancestors).add(reference.nodeId)
      });
      if (expanded.isReusable) expandedValueCache.set(cacheKey, expanded);
      return expanded;
    };

    const expanded = await expandValue({
      value: dto.value,
      environment: dto.environment,
      secretPath: dto.secretPath,
      secretKey: dto.secretKey,
      depth: 0,
      ancestors: new Set([createSecretId(dto.environment, dto.secretPath, dto.secretKey)])
    });

    expanded.referencedSecretIds.forEach((id) => dto.referencedSecretIds?.add(id));
    stackTrace.children = expanded.traceChildren;

    return { expandedValue: expanded.value, stackTrace };
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

    const referencedSecretIds = onSecretExpanded ? new Set<string>() : undefined;
    const { expandedValue } = await recursivelyExpandSecret({ ...inputSecret, referencedSecretIds });
    if (referencedSecretIds?.size) {
      const { environment, secretPath, secretKey } = inputSecret;
      onSecretExpanded?.({ environment, secretPath, secretKey }, [...referencedSecretIds]);
    }

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
