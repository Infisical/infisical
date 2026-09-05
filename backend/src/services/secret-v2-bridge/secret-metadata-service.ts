import { ActionProjectType, ProjectVersion, SecretType } from "@app/db/schemas";
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

const SECRET_METADATA_SCAN_BATCH_SIZE = 500;

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
    cursor,
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
      throw new BadRequestError({
        message: "Upgrade this project to use secret metadata browsing.",
        name: "ProjectVersionNotSupported"
      });
    }

    // Folder-only users can still copy empty folders. Never infer permission at a
    // child path from the root: grants can be scoped by path, secret name or tag.
    if (!hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret)) {
      return { secrets: [], nextCursor: null };
    }

    const paths = await recursivelyGetSecretPaths({
      folderDAL,
      projectEnvDAL,
      projectId,
      environment,
      currentPath: secretPath
    });
    if (!paths.length) return { secrets: [], nextCursor: null };

    const pathByFolderId = new Map(paths.map(({ folderId, path }) => [folderId, path]));
    const getAccessibleMetadata = (
      scanned: Awaited<ReturnType<TSecretV2BridgeDALFactory["findMetadataByFolderIds"]>>
    ) =>
      scanned.flatMap((secret) => {
        const path = pathByFolderId.get(secret.folderId);
        if (!path) return [];
        const subject = {
          environment,
          secretPath: path,
          secretName: secret.key,
          secretTags: secret.tagSlugs
        };
        if (
          !hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, subject)
        ) {
          return [];
        }
        return [
          {
            id: secret.id,
            secretKey: secret.key,
            secretPath: path,
            type: SecretType.Shared as const,
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

    const scanLimit = Math.max(limit + 1, SECRET_METADATA_SCAN_BATCH_SIZE);
    const folderIds = paths.map(({ folderId }) => folderId);
    const secrets: ReturnType<typeof getAccessibleMetadata> = [];
    let afterId = cursor;

    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const scanned = await secretDAL.findMetadataByFolderIds({ folderIds, afterId, limit: scanLimit });
      for (const secret of getAccessibleMetadata(scanned)) {
        if (secrets.length === limit) {
          return { secrets, nextCursor: secrets[secrets.length - 1].id };
        }
        secrets.push(secret);
      }

      if (scanned.length < scanLimit) return { secrets, nextCursor: null };
      afterId = scanned[scanned.length - 1].id;
    }
  };

  return { getSecretMetadata };
};
