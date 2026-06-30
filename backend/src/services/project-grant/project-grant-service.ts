import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionProjectGrantActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { prefixWithSlash } from "@app/lib/fn";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { TProjectGrantDALFactory } from "./project-grant-dal";
import { isCrossProjectEnabled } from "./project-grant-fns";
import {
  TCreateProjectGrantDTO,
  TDeleteProjectGrantDTO,
  TListProjectGrantsDTO,
  TListProjectGrantsForTargetDTO
} from "./project-grant-types";

export type TProjectGrantServiceFactory = ReturnType<typeof projectGrantServiceFactory>;

const normalizeSecretPath = (secretPath: string) => prefixWithSlash(secretPath.split("/").filter(Boolean).join("/"));

type TProjectGrantServiceFactoryDep = {
  projectGrantDAL: TProjectGrantDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findById" | "findSecretPathByFolderIds">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "invalidateSecretCacheByProjectId">;
};

export const projectGrantServiceFactory = ({
  projectGrantDAL,
  folderDAL,
  projectDAL,
  orgDAL,
  permissionService,
  secretV2BridgeDAL
}: TProjectGrantServiceFactoryDep) => {
  const createGrant = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    sourceProjectId,
    environment,
    secretPath,
    targetProjectId
  }: TCreateProjectGrantDTO) => {
    if (!(await isCrossProjectEnabled(actorOrgId, orgDAL))) {
      throw new ForbiddenRequestError({ message: "Cross-project secret sharing is not enabled for this organization" });
    }

    const canonicalSecretPath = normalizeSecretPath(secretPath);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: sourceProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProjectGrantActions.CreateGrant,
      subject(ProjectPermissionSub.ProjectGrant, { environment, secretPath: canonicalSecretPath })
    );

    const folder = await folderDAL.findBySecretPath(sourceProjectId, environment, canonicalSecretPath);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder not found at path '${canonicalSecretPath}' in environment '${environment}'`
      });
    }

    const targetProject = await projectDAL.findById(targetProjectId);
    if (!targetProject || targetProject.orgId !== actorOrgId) {
      throw new NotFoundError({ message: "Target project not found in this organization" });
    }

    if (sourceProjectId === targetProjectId) {
      throw new BadRequestError({ message: "Source and target project cannot be the same" });
    }

    const existing = await projectGrantDAL.findOne({
      sourceProjectId,
      sourceFolderId: folder.id,
      targetProjectId
    });
    if (existing) {
      throw new BadRequestError({ message: "A grant already exists for this folder and target project" });
    }

    const grant = await projectGrantDAL.create({ sourceProjectId, sourceFolderId: folder.id, targetProjectId });
    // Invalidate the target project's secret cache so cross-project references resolve immediately
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(targetProjectId);
    return grant;
  };

  const deleteGrant = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    grantId,
    sourceProjectId
  }: TDeleteProjectGrantDTO) => {
    if (!(await isCrossProjectEnabled(actorOrgId, orgDAL))) {
      throw new ForbiddenRequestError({ message: "Cross-project secret sharing is not enabled for this organization" });
    }

    const grant = await projectGrantDAL.findById(grantId);
    if (!grant || grant.sourceProjectId !== sourceProjectId) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const [folderInfo] = await folderDAL.findSecretPathByFolderIds(sourceProjectId, [grant.sourceFolderId]);
    if (!folderInfo) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: sourceProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProjectGrantActions.RevokeGrant,
      subject(ProjectPermissionSub.ProjectGrant, {
        environment: folderInfo.environmentSlug,
        secretPath: folderInfo.path
      })
    );

    const deleted = await projectGrantDAL.deleteById(grantId);
    // Invalidate the target project's secret cache so revoked references stop resolving immediately
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(grant.targetProjectId);
    return { ...deleted, environment: folderInfo.environmentSlug, secretPath: folderInfo.path };
  };

  const listGrantsByProject = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    sourceProjectId
  }: TListProjectGrantsDTO) => {
    if (!(await isCrossProjectEnabled(actorOrgId, orgDAL))) {
      return [];
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: sourceProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProjectGrantActions.ReadGrant,
      ProjectPermissionSub.ProjectGrant
    );

    return projectGrantDAL.listBySourceProject(sourceProjectId);
  };

  const listGrantsForTargetProject = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    targetProjectId
  }: TListProjectGrantsForTargetDTO) => {
    if (!(await isCrossProjectEnabled(actorOrgId, orgDAL))) {
      return [];
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: targetProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.SecretImports);

    return projectGrantDAL.listByTargetProject(targetProjectId);
  };

  return { createGrant, deleteGrant, listGrantsByProject, listGrantsForTargetProject };
};
