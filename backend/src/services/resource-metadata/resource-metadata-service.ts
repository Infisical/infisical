import { TDbClient } from "@app/db";
import { ActionProjectType } from "@app/db/schemas";
import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { MAX_SECRET_METADATA_SEARCH_SECRETS, TResourceMetadataDALFactory } from "./resource-metadata-dal";
import { dedupeMetadata, matchesSecretMetadataFilters } from "./resource-metadata-fns";
import { TResolvedSecretMetadata, TSearchSecretMetadataDTO } from "./resource-metadata-types";

type TResourceMetadataServiceFactoryDep = {
  db: TDbClient;
  resourceMetadataDAL: Pick<
    TResourceMetadataDALFactory,
    "searchSecretMetadata" | "searchSecretMetadataWithEncryptedValues" | "transaction"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds" | "findBySecretPathMultiEnv" | "findByEnvsDeep">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TResourceMetadataServiceFactory = ReturnType<typeof resourceMetadataServiceFactory>;

// merged match accumulator: a secret can be matched via plaintext and/or decrypted encrypted metadata,
// so matched entries are de-duplicated by key/value before being surfaced in the response.
type TMatchedSecret = {
  secretId: string;
  secretKey: string;
  folderId: string;
  tags: { id: string; slug: string }[];
  metadata: TResolvedSecretMetadata[];
};

export const resourceMetadataServiceFactory = ({
  db,
  resourceMetadataDAL,
  permissionService,
  folderDAL,
  projectEnvDAL,
  kmsService
}: TResourceMetadataServiceFactoryDep) => {
  // Project-scoped secret metadata search. The base query matches on org + project + key/value; the
  // results are then filtered so the requester actually has DescribeSecret permission on each returned
  // secret (path/tag aware). Requesting a project the actor cannot access throws (via getProjectPermission).
  const searchSecretMetadata = async ({
    projectId,
    filters,
    operator,
    tagSlugs,
    environments,
    secretPath = "/",
    actor
  }: TSearchSecretMetadataDTO) => {
    if (!filters.length) {
      throw new BadRequestError({ message: "At least one metadata filter is required" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const searchLimit = MAX_SECRET_METADATA_SEARCH_SECRETS;
    const environmentSlugs =
      environments ?? (await projectEnvDAL.find({ projectId }, { tx: db })).map((env) => env.slug);
    const parents = await folderDAL.findBySecretPathMultiEnv(projectId, environmentSlugs, secretPath, db);
    if (!parents.length) return { secrets: [], searchLimit };
    const scopedFolders = await folderDAL.findByEnvsDeep({ parentIds: parents.map((folder) => folder.id) }, db);
    const scopedFolderIds = scopedFolders.map((folder) => folder.id);

    // run both searches on primary via a transaction so recently written metadata is visible (avoids
    // replica lag). Plaintext values are matched in SQL; encrypted values can't be (non-deterministic
    // ciphertext), so their candidates are fetched by key and matched in-app after decryption below.
    const { plaintextMatched, encryptedCandidates } = await resourceMetadataDAL.transaction(async (tx) => {
      const plaintext = await resourceMetadataDAL.searchSecretMetadata(
        { orgId: actor.orgId, projectId, filters, operator, tagSlugs, folderIds: scopedFolderIds },
        tx
      );
      const encrypted = await resourceMetadataDAL.searchSecretMetadataWithEncryptedValues(
        { orgId: actor.orgId, projectId, filters, operator, tagSlugs, folderIds: scopedFolderIds },
        tx
      );
      return { plaintextMatched: plaintext, encryptedCandidates: encrypted };
    });

    const matchedSecretById = new Map<string, TMatchedSecret>();

    const addMatch = (
      secret: Pick<TMatchedSecret, "secretId" | "secretKey" | "folderId" | "tags">,
      metadata: TResolvedSecretMetadata[]
    ) => {
      const existing = matchedSecretById.get(secret.secretId);
      if (existing) {
        existing.metadata.push(...metadata);
      } else {
        matchedSecretById.set(secret.secretId, { ...secret, metadata: [...metadata] });
      }
    };

    // plaintext secrets are already matched in SQL — their hydrated rows are the matched metadata
    plaintextMatched.forEach((secret) => {
      addMatch(
        secret,
        secret.metadata.map((entry) => ({ key: entry.key, value: entry.value ?? "" }))
      );
    });

    // decrypt encrypted candidates once per project (data key is resolved lazily), then match in-app
    if (encryptedCandidates.length) {
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      encryptedCandidates.forEach((secret) => {
        const resolvedMetadata = secret.metadata.flatMap((entry) => {
          if (!entry.encryptedValue) {
            return [{ key: entry.key, value: entry.value ?? "" }];
          }

          try {
            return [
              {
                key: entry.key,
                value: secretManagerDecryptor({ cipherTextBlob: entry.encryptedValue }).toString()
              }
            ];
          } catch (err) {
            logger.error(
              { err },
              `Failed to decrypt secret metadata [projectId=${projectId}] [secretId=${secret.secretId}] [key=${entry.key}]`
            );
            return [];
          }
        });

        const { matched, matchedMetadata } = matchesSecretMetadataFilters(operator, filters, resolvedMetadata);
        if (matched) addMatch(secret, matchedMetadata);
      });
    }

    const matchedSecrets = [...matchedSecretById.values()];
    if (!matchedSecrets.length) return { secrets: [], searchLimit };

    const folderIds = [...new Set(matchedSecrets.map((secret) => secret.folderId))];
    const foldersWithPath = await folderDAL.findSecretPathByFolderIds(projectId, folderIds, db);
    const folderPathById: Record<string, { path: string; environmentSlug: string }> = {};
    foldersWithPath.forEach((folder) => {
      if (folder) folderPathById[folder.id] = { path: folder.path, environmentSlug: folder.environmentSlug };
    });

    const secrets = matchedSecrets.flatMap((secret) => {
      const folder = folderPathById[secret.folderId];
      if (!folder) return [];

      const canDescribe = hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.DescribeSecret,
        {
          environment: folder.environmentSlug,
          secretPath: folder.path,
          secretName: secret.secretKey,
          secretTags: secret.tags.map((tag) => tag.slug)
        }
      );

      if (!canDescribe) return [];

      return [
        {
          secretId: secret.secretId,
          secretKey: secret.secretKey,
          environment: folder.environmentSlug,
          secretPath: folder.path,
          tags: secret.tags,
          secretValueHidden: !hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment: folder.environmentSlug,
              secretPath: folder.path,
              secretName: secret.secretKey,
              secretTags: secret.tags.map((tag) => tag.slug)
            }
          ),
          metadata: dedupeMetadata(secret.metadata)
        }
      ];
    });

    return { secrets, searchLimit };
  };

  return { searchSecretMetadata };
};
