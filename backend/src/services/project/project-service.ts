import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { ProjectMembershipRole } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { createSecretBlindIndex } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TSecretBlindIndexDALFactory } from "../secret-blind-index/secret-blind-index-dal";
import { ROOT_FOLDER_NAME, TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TProjectDALFactory } from "./project-dal";
import { TCreateProjectDTO, TDeleteProjectDTO, TGetProjectDTO } from "./project-types";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

type TProjectServiceFactoryDep = {
  projectDAL: TProjectDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "insertMany">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "insertMany">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "create">;
  secretBlindIndexDAL: Pick<TSecretBlindIndexDALFactory, "create">;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TProjectServiceFactory = ReturnType<typeof projectServiceFactory>;

export const projectServiceFactory = ({
  projectDAL,
  permissionService,
  folderDAL,
  secretBlindIndexDAL,
  projectMembershipDAL,
  projectEnvDAL,
  licenseService
}: TProjectServiceFactoryDep) => {
  /*
   * Create workspace. Make user the admin
   * */
  const createProject = async ({ orgId, actor, actorId, workspaceName }: TCreateProjectDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.Workspace
    );

    const appCfg = getConfig();
    const blindIndex = createSecretBlindIndex(appCfg.ROOT_ENCRYPTION_KEY, appCfg.ENCRYPTION_KEY);

    const plan = await licenseService.getPlan(orgId);
    if (plan.workspaceLimit !== null && plan.workspacesUsed >= plan.workspaceLimit) {
      // case: limit imposed on number of workspaces allowed
      // case: number of workspaces used exceeds the number of workspaces allowed
      throw new BadRequestError({
        message:
          "Failed to create workspace due to plan limit reached. Upgrade plan to add more workspaces."
      });
    }

    const newProject = projectDAL.transaction(async (tx) => {
      const project = await projectDAL.create(
        { name: workspaceName, orgId, slug: slugify(`${workspaceName}-${alphaNumericNanoId(4)}`) },
        tx
      );
      // set user as admin member for proeject
      await projectMembershipDAL.create(
        {
          userId: actorId,
          role: ProjectMembershipRole.Admin,
          projectId: project.id
        },
        tx
      );
      // generate the blind index for project
      await secretBlindIndexDAL.create(
        {
          projectId: project.id,
          keyEncoding: blindIndex.keyEncoding,
          saltIV: blindIndex.iv,
          saltTag: blindIndex.tag,
          algorithm: blindIndex.algorithm,
          encryptedSaltCipherText: blindIndex.ciphertext
        },
        tx
      );
      // set default environments and root folder for provided environments
      const envs = await projectEnvDAL.insertMany(
        DEFAULT_PROJECT_ENVS.map((el, i) => ({ ...el, projectId: project.id, position: i + 1 })),
        tx
      );
      await folderDAL.insertMany(
        envs.map(({ id }) => ({ name: ROOT_FOLDER_NAME, envId: id, version: 1 })),
        tx
      );
      // _id for backward compat
      return { ...project, environments: envs, _id: project.id };
    });

    return newProject;
  };

  const deleteProject = async ({ actor, actorId, projectId }: TDeleteProjectDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Project
    );

    const deletedProject = await projectDAL.deleteById(projectId);
    return deletedProject;
  };

  const getProjects = async (actorId: string) => {
    const workspaces = await projectDAL.findAllProjects(actorId);
    return workspaces;
  };

  const getAProject = async ({ actorId, projectId, actor }: TGetProjectDTO) => {
    await permissionService.getProjectPermission(actor, actorId, projectId);
    return projectDAL.findProjectById(projectId);
  };

  const toggleAutoCapitalization = async ({
    projectId,
    actor,
    actorId,
    autoCapitalization
  }: TGetProjectDTO & { autoCapitalization: boolean }) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Settings
    );

    const updatedProject = await projectDAL.updateById(projectId, { autoCapitalization });
    return updatedProject;
  };

  const updateName = async ({
    projectId,
    actor,
    actorId,
    name
  }: TGetProjectDTO & { name: string }) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Settings
    );

    const updatedProject = await projectDAL.updateById(projectId, { name });
    return updatedProject;
  };

  return {
    createProject,
    deleteProject,
    getProjects,
    getAProject,
    toggleAutoCapitalization,
    updateName
  };
};
