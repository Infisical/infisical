import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, TPamFolders } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPamFolderDALFactory } from "./pam-folder-dal";
import { TCreateFolderDTO, TUpdateFolderDTO } from "./pam-folder-types";

type TPamFolderServiceFactoryDep = {
  pamFolderDAL: TPamFolderDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TPamFolderServiceFactory = ReturnType<typeof pamFolderServiceFactory>;

export const pamFolderServiceFactory = ({
  pamFolderDAL,
  permissionService,
  licenseService
}: TPamFolderServiceFactoryDep) => {
  const createFolder = async ({ name, description, parentId, projectId }: TCreateFolderDTO, actor: OrgServiceActor) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.PamFolders);

    if (parentId) {
      if (!(await pamFolderDAL.findOne({ id: parentId, projectId }))) {
        throw new NotFoundError({
          message: `Parent folder '${parentId}' not found for project '${projectId}'`
        });
      }
    }

    const existingFolder = await pamFolderDAL.findOne({
      name,
      parentId: parentId || null,
      projectId
    });

    if (existingFolder) {
      throw new BadRequestError({
        message: `Folder with name '${name}' already exists for this parent`
      });
    }

    const folder = await pamFolderDAL.create({
      name,
      description: description ?? null,
      parentId: parentId || null,
      projectId
    });

    return folder;
  };

  const updateFolder = async ({ id, name, description }: TUpdateFolderDTO, actor: OrgServiceActor) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    const folder = await pamFolderDAL.findById(id);
    if (!folder) throw new NotFoundError({ message: `Folder with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: folder.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PamFolders);

    const updateDoc: Partial<TPamFolders> = {};

    if (name !== undefined) {
      updateDoc.name = name;
    }

    if (description !== undefined) {
      updateDoc.description = description;
    }

    if (name && name !== folder.name) {
      const existingFolder = await pamFolderDAL.findOne({
        name,
        parentId: folder.parentId || null,
        projectId: folder.projectId
      });

      if (existingFolder) {
        throw new BadRequestError({
          message: `Folder with name '${name}' already exists for this parent`
        });
      }
    }

    if (Object.keys(updateDoc).length === 0) {
      return folder;
    }

    const updatedFolder = await pamFolderDAL.updateById(id, updateDoc);

    return updatedFolder;
  };

  const deleteFolder = async (id: string, actor: OrgServiceActor) => {
    const folder = await pamFolderDAL.findById(id);
    if (!folder) throw new NotFoundError({ message: `Folder with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: folder.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.PamFolders);

    const deletedFolder = await pamFolderDAL.deleteById(id);

    return deletedFolder;
  };

  return { createFolder, updateFolder, deleteFolder };
};
