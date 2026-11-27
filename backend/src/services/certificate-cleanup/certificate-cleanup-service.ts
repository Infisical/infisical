import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { TProjectPermissionService } from "@app/domains/platform/projects/ce/module";
import { ForbiddenRequestError } from "@app/lib/errors";

import { TCertificateCleanupConfigDALFactory } from "./certificate-cleanup-dal";
import { TGetCertificateCleanupConfigDTO, TUpdateCertificateCleanupConfigDTO } from "./certificate-cleanup-types";

type TCertificateCleanupServiceFactoryDep = {
  certificateCleanupConfigDAL: TCertificateCleanupConfigDALFactory;
  projectPermissionService: TProjectPermissionService;
};

export type TCertificateCleanupServiceFactory = ReturnType<typeof certificateCleanupServiceFactory>;

export const certificateCleanupServiceFactory = ({
  certificateCleanupConfigDAL,
  projectPermissionService
}: TCertificateCleanupServiceFactoryDep) => {
  const getConfig = async ({ projectId, actor }: TGetCertificateCleanupConfigDTO) => {
    const permission = await projectPermissionService.getProjectPermission({
      actor,
      projectId,
      type: ProjectType.CertificateManager
    });

    if (!permission.hasRole({ slug: ProjectMembershipRole.Admin })) {
      throw new ForbiddenRequestError({ message: "Only admins can access certificate cleanup configuration" });
    }

    const config = await certificateCleanupConfigDAL.findOne({ projectId });

    return config || null;
  };

  const updateConfig = async ({
    projectId,
    actor,
    isEnabled,
    postExpiryRetentionDays,
    skipCertsWithActiveSyncs
  }: TUpdateCertificateCleanupConfigDTO) => {
    const permission = await projectPermissionService.getProjectPermission({
      actor,
      projectId,
      type: ProjectType.CertificateManager
    });

    if (!permission.hasRole({ slug: ProjectMembershipRole.Admin })) {
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
