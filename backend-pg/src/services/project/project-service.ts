import { ForbiddenError } from "@casl/ability";

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

import { TProjectEnvDalFactory } from "../project-env/project-env-dal";
import { TProjectMembershipDalFactory } from "../project-membership/project-membership-dal";
import { TSecretBlindIndexDalFactory } from "../secret/secret-blind-index-dal";
import { ROOT_FOLDER_NAME, TSecretFolderDalFactory } from "../secret-folder/secret-folder-dal";
import { TProjectDalFactory } from "./project-dal";
import { TCreateProjectDTO, TDeleteProjectDTO, TGetProjectDTO } from "./project-types";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

type TProjectServiceFactoryDep = {
  projectDal: TProjectDalFactory;
  folderDal: Pick<TSecretFolderDalFactory, "insertMany">;
  projectEnvDal: Pick<TProjectEnvDalFactory, "insertMany">;
  projectMembershipDal: Pick<TProjectMembershipDalFactory, "create">;
  secretBlindIndexDal: Pick<TSecretBlindIndexDalFactory, "create">;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TProjectServiceFactory = ReturnType<typeof projectServiceFactory>;

export const projectServiceFactory = ({
  projectDal,
  permissionService,
  folderDal,
  secretBlindIndexDal,
  projectMembershipDal,
  projectEnvDal,
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

    const newProject = projectDal.transaction(async (tx) => {
      const project = await projectDal.create({ name: workspaceName, orgId }, tx);
      // set user as admin member for proeject
      await projectMembershipDal.create(
        {
          userId: actorId,
          role: ProjectMembershipRole.Admin,
          projectId: project.id
        },
        tx
      );
      // generate the blind index for project
      await secretBlindIndexDal.create(
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
      const envs = await projectEnvDal.insertMany(
        DEFAULT_PROJECT_ENVS.map((el, i) => ({ ...el, projectId: project.id, position: i + 1 })),
        tx
      );
      await folderDal.insertMany(
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

    // TODO(backend-pg): licence server
    const deletedProject = await projectDal.deleteById(projectId);
    return deletedProject;
  };

  const getProjects = async (actorId: string) => {
    const workspaces = await projectDal.findAllProjects(actorId);
    return workspaces;
  };

  const getAProject = async ({ actorId, projectId, actor }: TGetProjectDTO) => {
    await permissionService.getProjectPermission(actor, actorId, projectId);
    return projectDal.findProjectById(projectId);
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

    const updatedProject = await projectDal.updateById(projectId, { autoCapitalization });
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

    const updatedProject = await projectDal.updateById(projectId, { name });
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
