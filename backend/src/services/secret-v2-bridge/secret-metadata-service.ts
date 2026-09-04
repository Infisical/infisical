import { ActionProjectType, ProjectVersion } from "@app/db/schemas";
import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TGetSecretMetadataDTO } from "@app/services/secret/secret-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";
import { recursivelyGetSecretPaths } from "./secret-v2-bridge-fns";

export const secretMetadataServiceFactory = ({
  permissionService,
  folderDAL,
  projectEnvDAL,
  projectDAL,
  secretDAL
}: {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "findMetadataByFolderIds">;
}) => {
  const getSecretMetadata = async ({
    projectId,
    environment,
    secretPath,
    offset,
    limit,
    ...actor
  }: TGetSecretMetadataDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      ...actor,
      projectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: "Project not found" });
    if (project.version !== ProjectVersion.V3) {
      throw new BadRequestError({ message: "Upgrade this project to use secret metadata browsing.", name: "ProjectVersionNotSupported" });
    }

    // Folder-only users can still copy empty folders. Never infer permission at a
    // child path from the root: grants can be scoped by path, secret name or tag.
    if (!hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret)) {
      return { secrets: [], nextOffset: null };
    }

    const paths = await recursivelyGetSecretPaths({
      folderDAL,
      projectEnvDAL,
      projectId,
      environment,
      currentPath: secretPath
    });
    if (!paths.length) return { secrets: [], nextOffset: null };

    const pathByFolderId = new Map(paths.map(({ folderId, path }) => [folderId, path]));
    const scanned = await secretDAL.findMetadataByFolderIds({
      folderIds: paths.map(({ folderId }) => folderId),
      offset,
      limit: limit + 1
    });
    const secrets = scanned.slice(0, limit).flatMap((secret) => {
      const path = pathByFolderId.get(secret.folderId);
      if (!path) return [];
      const subject = {
        environment,
        secretPath: path,
        secretName: secret.key,
        secretTags: secret.tagSlugs
      };
      if (!hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, subject)) {
        return [];
      }
      return [
        {
          id: secret.id,
          secretKey: secret.key,
          secretPath: path,
          type: secret.type,
          isHoneyTokenSecret: secret.isHoneyTokenSecret,
          isRotatedSecret: secret.isRotatedSecret,
          secretValueHidden: !hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            subject
          )
        }
      ];
    });

    // Advance over scanned rows, even when a whole page is hidden by permissions.
    return { secrets, nextOffset: scanned.length > limit ? offset + limit : null };
  };

  return { getSecretMetadata };
};
