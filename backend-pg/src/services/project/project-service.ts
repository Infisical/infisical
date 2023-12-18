import { ForbiddenError } from "@casl/ability";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

import { TProjectEnvDalFactory } from "../project-env/project-env-dal";
import { TProjectMembershipDalFactory } from "../project-membership/project-membership-dal";
import { TProjectDalFactory } from "./project-dal";
import { TCreateProjectDTO, TDeleteProjectDTO, TGetProjectDTO } from "./project-types";

const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

type TProjectServiceFactoryDep = {
  projectDal: TProjectDalFactory;
  projectEnvDal: Pick<TProjectEnvDalFactory, "insertMany">;
  projectMembershipDal: Pick<TProjectMembershipDalFactory, "create">;
  permissionService: TPermissionServiceFactory;
};

export type TProjectServiceFactory = ReturnType<typeof projectServiceFactory>;

export const projectServiceFactory = ({
  projectDal,
  permissionService,
  projectMembershipDal,
  projectEnvDal
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

    // TODO(backend-pg): licence server
    const newProject = projectDal.transaction(async (tx) => {
      const project = await projectDal.create({ name: workspaceName, orgId }, tx);
      await projectMembershipDal.create(
        {
          userId: actorId,
          role: ProjectMembershipRole.Admin,
          projectId: project.id
        },
        tx
      );
      const envs = await projectEnvDal.insertMany(
        DEFAULT_PROJECT_ENVS.map((el) => ({ ...el, projectId: project.id })),
        tx
      );
      return { ...project, environments: envs };
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
