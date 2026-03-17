import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ForbiddenRequestError } from "@app/lib/errors";

import { TCertificateCleanupConfigDALFactory } from "./certificate-cleanup-dal";
import { TGetCertificateCleanupConfigDTO, TUpdateCertificateCleanupConfigDTO } from "./certificate-cleanup-types";

type TCertificateCleanupServiceFactoryDep = {
  certificateCleanupConfigDAL: TCertificateCleanupConfigDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateCleanupServiceFactory = ReturnType<typeof certificateCleanupServiceFactory>;

export const certificateCleanupServiceFactory = ({
  certificateCleanupConfigDAL,
  permissionService
}: TCertificateCleanupServiceFactoryDep) => {
  const getConfig = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetCertificateCleanupConfigDTO) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can access certificate cleanup configuration" });
    }

    const config = await certificateCleanupConfigDAL.findOne({ projectId });

    return config || null;
  };

  const updateConfig = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    isEnabled,
    postExpiryRetentionDays,
    skipCertsWithActiveSyncs
  }: TUpdateCertificateCleanupConfigDTO) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can modify certificate cleanup configuration" });
    }

    const config = await certificateCleanupConfigDAL.transaction(async (tx) => {
      const existing = await certificateCleanupConfigDAL.findOne({ projectId }, tx);

      if (existing) {
        return certificateCleanupConfigDAL.updateById(
          existing.id,
          {
            isEnabled,
            postExpiryRetentionDays,
            skipCertsWithActiveSyncs
          },
          tx
        );
      }

      return certificateCleanupConfigDAL.create(
        {
          projectId,
          isEnabled: isEnabled ?? false,
          postExpiryRetentionDays: postExpiryRetentionDays ?? 3,
          skipCertsWithActiveSyncs: skipCertsWithActiveSyncs ?? true
        },
        tx
      );
    });

    return config;
  };

  return { getConfig, updateConfig };
};
