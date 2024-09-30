import { ForbiddenError } from "@casl/ability";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TProjectDALFactory } from "../project/project-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TProjectEnvDALFactory } from "./project-env-dal";
import { TCreateEnvDTO, TDeleteEnvDTO, TGetEnvDTO, TUpdateEnvDTO } from "./project-env-types";

type TProjectEnvServiceFactoryDep = {
  projectEnvDAL: TProjectEnvDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "create">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TProjectEnvServiceFactory = ReturnType<typeof projectEnvServiceFactory>;

export const projectEnvServiceFactory = ({
  projectEnvDAL,
  permissionService,
  licenseService,
  projectDAL,
  folderDAL
}: TProjectEnvServiceFactoryDep) => {
  const createEnvironment = async ({
    projectId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    name,
    slug
  }: TCreateEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Environments);

    const envs = await projectEnvDAL.find({ projectId });
    const existingEnv = envs.find(({ slug: envSlug }) => envSlug === slug);
    if (existingEnv)
      throw new BadRequestError({
        message: "Environment with slug already exist",
        name: "CreateEnvironment"
      });

    const project = await projectDAL.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (plan.environmentLimit !== null && envs.length >= plan.environmentLimit) {
      // case: limit imposed on number of environments allowed
      // case: number of environments used exceeds the number of environments allowed
      throw new BadRequestError({
        message:
          "Failed to create environment due to environment limit reached. Upgrade plan to create more environments."
      });
    }

    const env = await projectEnvDAL.transaction(async (tx) => {
      const lastPos = await projectEnvDAL.findLastEnvPosition(projectId, tx);
      const doc = await projectEnvDAL.create({ slug, name, projectId, position: lastPos + 1 }, tx);
      await folderDAL.create({ name: "root", parentId: null, envId: doc.id, version: 1 }, tx);
      return doc;
    });
    return env;
  };

  const updateEnvironment = async ({
    projectId,
    slug,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    name,
    id,
    position
  }: TUpdateEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Environments);

    const oldEnv = await projectEnvDAL.findOne({ id, projectId });
    if (!oldEnv) throw new NotFoundError({ message: "Environment not found" });

    if (slug) {
      const existingEnv = await projectEnvDAL.findOne({ slug, projectId });
      if (existingEnv && existingEnv.id !== id) {
        throw new BadRequestError({
          message: "Environment with slug already exist",
          name: "UpdateEnvironment"
        });
      }
    }

    const env = await projectEnvDAL.transaction(async (tx) => {
      if (position) {
        await projectEnvDAL.updateAllPosition(projectId, oldEnv.position, position, tx);
      }
      return projectEnvDAL.updateById(oldEnv.id, { name, slug, position }, tx);
    });
    return { environment: env, old: oldEnv };
  };

  const deleteEnvironment = async ({ projectId, actor, actorId, actorOrgId, actorAuthMethod, id }: TDeleteEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Environments);

    const env = await projectEnvDAL.transaction(async (tx) => {
      const [doc] = await projectEnvDAL.delete({ id, projectId }, tx);
      if (!doc)
        throw new NotFoundError({
          message: "Env doesn't exist",
          name: "DeleteEnvironment"
        });

      await projectEnvDAL.updateAllPosition(projectId, doc.position, -1, tx);
      return doc;
    });
    return env;
  };

  const getEnvironmentById = async ({ projectId, actor, actorId, actorOrgId, actorAuthMethod, id }: TGetEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);

    const [env] = await projectEnvDAL.find({
      id,
      projectId
    });

    if (!env) {
      throw new NotFoundError({
        message: "Environment does not exist"
      });
    }

    return env;
  };

  return {
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    getEnvironmentById
  };
};
