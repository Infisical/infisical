import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionProjectGrantActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TProjectGrantDALFactory } from "./project-grant-dal";
import { TCreateProjectGrantDTO, TDeleteProjectGrantDTO, TListProjectGrantsDTO } from "./project-grant-types";

export type TProjectGrantServiceFactory = ReturnType<typeof projectGrantServiceFactory>;

type TProjectGrantServiceFactoryDep = {
  projectGrantDAL: TProjectGrantDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export const projectGrantServiceFactory = ({
  projectGrantDAL,
  folderDAL,
  projectDAL,
  permissionService
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
      subject(ProjectPermissionSub.ProjectGrant, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(sourceProjectId, environment, secretPath);
    if (!folder) {
      throw new NotFoundError({ message: `Folder not found at path '${secretPath}' in environment '${environment}'` });
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

    return projectGrantDAL.create({ sourceProjectId, sourceFolderId: folder.id, targetProjectId });
  };

  const deleteGrant = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    grantId,
    sourceProjectId
  }: TDeleteProjectGrantDTO) => {
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
      ProjectPermissionSub.ProjectGrant
    );

    const grant = await projectGrantDAL.findById(grantId);
    if (!grant || grant.sourceProjectId !== sourceProjectId) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    return projectGrantDAL.deleteById(grantId);
  };

  const listGrantsByProject = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    sourceProjectId
  }: TListProjectGrantsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: sourceProjectId,
      actionProjectType: ActionProjectType.SecretManager
    });
    // CreateGrant implies the ability to read existing grants
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionProjectGrantActions.CreateGrant,
      ProjectPermissionSub.ProjectGrant
    );

    return projectGrantDAL.listBySourceProject(sourceProjectId);
  };

  return { createGrant, deleteGrant, listGrantsByProject };
};
