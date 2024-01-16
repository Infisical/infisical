import { ForbiddenError } from "@casl/ability";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TProjectDalFactory } from "../project/project-dal";
import { TProjectEnvDalFactory } from "./project-env-dal";
import { TCreateEnvDTO, TDeleteEnvDTO, TUpdateEnvDTO } from "./project-env-types";
import { TSecretFolderDalFactory } from "../secret-folder/secret-folder-dal";

type TProjectEnvServiceFactoryDep = {
  projectEnvDal: TProjectEnvDalFactory;
  folderDal: Pick<TSecretFolderDalFactory, "create">;
  projectDal: Pick<TProjectDalFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TProjectEnvServiceFactory = ReturnType<typeof projectEnvServiceFactory>;

export const projectEnvServiceFactory = ({
  projectEnvDal,
  permissionService,
  licenseService,
  projectDal,
  folderDal
}: TProjectEnvServiceFactoryDep) => {
  const createEnvironment = async ({ projectId, actorId, actor, name, slug }: TCreateEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Environments
    );

    const envs = await projectEnvDal.find({ projectId });
    const existingEnv = envs.find(({ slug: envSlug }) => envSlug === slug);
    if (existingEnv)
      throw new BadRequestError({
        message: "Environment with slug already exist",
        name: "Create envv"
      });

    const project = await projectDal.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (plan.environmentLimit !== null && envs.length >= plan.environmentLimit) {
      // case: limit imposed on number of environments allowed
      // case: number of environments used exceeds the number of environments allowed
      throw new BadRequestError({
        message:
          "Failed to create environment due to environment limit reached. Upgrade plan to create more environments."
      });
    }

    const env = await projectEnvDal.transaction(async (tx) => {
      const lastPos = await projectEnvDal.findLastEnvPosition(projectId, tx);
      const doc = await projectEnvDal.create({ slug, name, projectId, position: lastPos + 1 }, tx);
      await folderDal.create({ name: "root", parentId: null, envId: doc.id, version: 1 }, tx);
      return doc;
    });
    return env;
  };

  const updateEnvironment = async ({
    projectId,
    slug,
    actor,
    actorId,
    name,
    id,
    position
  }: TUpdateEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Environments
    );

    const oldEnv = await projectEnvDal.findOne({ id, projectId });
    if (!oldEnv) throw new BadRequestError({ message: "Environment not found" });

    if (slug) {
      const existingEnv = await projectEnvDal.findOne({ slug });
      if (existingEnv && existingEnv.id !== id) {
        throw new BadRequestError({
          message: "Environment with slug already exist",
          name: "Create envv"
        });
      }
    }

    const env = await projectEnvDal.transaction(async (tx) => {
      if (position) {
        await projectEnvDal.updateAllPosition(projectId, oldEnv.position, position, tx);
      }
      return projectEnvDal.updateById(oldEnv.id, { name, slug, position }, tx);
    });
    return { environment: env, old: oldEnv };
  };

  const deleteEnvironment = async ({ projectId, actor, actorId, id }: TDeleteEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Environments
    );

    const env = await projectEnvDal.transaction(async (tx) => {
      const [doc] = await projectEnvDal.delete({ id, projectId }, tx);
      if (!doc)
        throw new BadRequestError({
          message: "Env doesn't exist",
          name: "Re-order env"
        });

      await projectEnvDal.updateAllPosition(projectId, doc.position, -1, tx);
      return doc;
    });
    return env;
  };

  return {
    createEnvironment,
    updateEnvironment,
    deleteEnvironment
  };
};
