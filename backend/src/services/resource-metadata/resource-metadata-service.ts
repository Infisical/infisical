import { ActionProjectType } from "@app/db/schemas";
import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TResourceMetadataDALFactory } from "./resource-metadata-dal";
import { TSearchSecretMetadataDTO } from "./resource-metadata-types";

type TResourceMetadataServiceFactoryDep = {
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "searchSecretMetadata" | "transaction">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
};

export type TResourceMetadataServiceFactory = ReturnType<typeof resourceMetadataServiceFactory>;

export const resourceMetadataServiceFactory = ({
  resourceMetadataDAL,
  permissionService,
  folderDAL
}: TResourceMetadataServiceFactoryDep) => {
  // Project-scoped secret metadata search. The base query matches on org + project + key/value; the
  // results are then filtered so the requester actually has DescribeSecret permission on each returned
  // secret (path/tag aware). Requesting a project the actor cannot access throws (via getProjectPermission).
  const searchSecretMetadata = async ({ projectId, filters, operator, actor }: TSearchSecretMetadataDTO) => {
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

    // run on primary via a transaction so recently written metadata is visible (avoids replica lag)
    const matchedSecrets = await resourceMetadataDAL.transaction((tx) =>
      resourceMetadataDAL.searchSecretMetadata(
        {
          orgId: actor.orgId,
          projectId,
          filters,
          operator
        },
        tx
      )
    );

    if (!matchedSecrets.length) return { secrets: [] };

    const folderIds = [...new Set(matchedSecrets.map((secret) => secret.folderId))];
    const foldersWithPath = await folderDAL.findSecretPathByFolderIds(projectId, folderIds);
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
          metadata: secret.metadata.map(({ key, value }) => ({ key, value }))
        }
      ];
    });

    return { secrets };
  };

  return { searchSecretMetadata };
};
