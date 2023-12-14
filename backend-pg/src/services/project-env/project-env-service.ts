import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TProjectEnvDalFactory } from "./project-env-dal";
import { TCreateEnvDTO, TDeleteEnvDTO, TUpdateEnvDTO } from "./project-env-types";

import { ForbiddenError } from "@casl/ability";

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

    const env = await projectEnvDal.create({ slug, name, projectId });
    return env;
  };

  const updateEnvironment = async ({
    projectId,
    slug,
    actor,
    actorId,
    name,
    id
  }: TUpdateEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Environments
    );

    if (slug) {
      const existingEnv = await projectEnvDal.findOne({ slug });
      if (existingEnv && existingEnv.id !== id) {
        throw new BadRequestError({
          message: "Environment with slug already exist",
          name: "Create envv"
        });
      }
    }

    const [env] = await projectEnvDal.update({ id, projectId }, { name, slug });
    return env;
  };

  const deleteEnvironment = async ({ projectId, actor, actorId, id }: TDeleteEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Environments
    );

    const [env] = await projectEnvDal.delete({ id, projectId });
    return env;
  };

  return {
    createEnvironment,
    updateEnvironment,
    deleteEnvironment
  };
};
