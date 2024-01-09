import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TProjectEnvDalFactory } from "./project-env-dal";
import { TCreateEnvDTO, TDeleteEnvDTO, TUpdateEnvDTO } from "./project-env-types";

type TProjectEnvServiceFactoryDep = {
  projectEnvDal: TProjectEnvDalFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TProjectEnvServiceFactory = ReturnType<typeof projectEnvServiceFactory>;

export const projectEnvServiceFactory = ({
  projectEnvDal,
  permissionService
}: TProjectEnvServiceFactoryDep) => {
  const createEnvironment = async ({ projectId, actorId, actor, name, slug }: TCreateEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Environments
    );

    // TODO(akhilmhdh-pg): add licence service here
    const existingEnv = await projectEnvDal.findOne({ slug });
    if (existingEnv)
      throw new BadRequestError({
        message: "Environment with slug already exist",
        name: "Create envv"
      });

    const env = await projectEnvDal.transaction(async (tx) => {
      const lastPos = await projectEnvDal.findLastEnvPosition(projectId, tx);
      const doc = await projectEnvDal.create({ slug, name, projectId, position: lastPos + 1 }, tx);
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
