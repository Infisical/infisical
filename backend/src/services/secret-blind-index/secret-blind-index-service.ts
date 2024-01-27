import { ProjectMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import { TSecretDALFactory } from "../secret/secret-dal";
import { generateSecretBlindIndexBySalt } from "../secret/secret-fns";
import { TSecretBlindIndexDALFactory } from "./secret-blind-index-dal";
import {
  TGetProjectBlindIndexStatusDTO,
  TGetProjectSecretsDTO,
  TUpdateProjectSecretNameDTO
} from "./secret-blind-index-types";

type TSecretBlindIndexServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  secretDAL:Pick<TSecretDALFactory,'bulkUpdate'>;
};

export type TSecretBlindIndexServiceFactory = ReturnType<typeof secretBlindIndexServiceFactory>;

export const secretBlindIndexServiceFactory = ({
  secretBlindIndexDAL,
  permissionService,
  secretDAL
}: TSecretBlindIndexServiceFactoryDep) => {
  const getSecretBlindIndexStatus = async ({
    actor,
    projectId,
    actorId
  }: TGetProjectBlindIndexStatusDTO) => {
    const { membership } = await permissionService.getProjectPermission(actor, actorId, projectId);
    if (membership?.role !== ProjectMembershipRole.Admin) {
      throw new UnauthorizedError({ message: "User must be admin" });
    }

    const secretCount = await secretBlindIndexDAL.countOfSecretsWithNullSecretBlindIndex(projectId);
    return Number(secretCount);
  };

  const getProjectSecrets = async ({ projectId, actorId, actor }: TGetProjectSecretsDTO) => {
    const { membership } = await permissionService.getProjectPermission(actor, actorId, projectId);
    if (membership?.role !== ProjectMembershipRole.Admin) {
      throw new UnauthorizedError({ message: "User must be admin" });
    }

    const secrets = await secretBlindIndexDAL.findAllSecretsByProjectId(projectId);
    return secrets;
  };

  const updateProjectSecretName = async ({
    projectId,
    actor,
    actorId,
    secretsToUpdate
  }: TUpdateProjectSecretNameDTO) => {
    const { membership } = await permissionService.getProjectPermission(actor, actorId, projectId);
    if (membership?.role !== ProjectMembershipRole.Admin) {
      throw new UnauthorizedError({ message: "User must be admin" });
    }
    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg)
      throw new BadRequestError({ message: "Blind index not found", name: "CreateSecret" });

    const operations = await Promise.all(secretsToUpdate.map(async ({secretName,secretId:id})=>{
      const secretBlindIndex = await generateSecretBlindIndexBySalt(secretName,blindIndexCfg);
      return { filter:{id},data:{secretBlindIndex} }
    }))

    await secretBlindIndexDAL.transaction(async(tx)=>{
      await secretDAL.bulkUpdate(operations,tx)
    })
  };

  return {
    getSecretBlindIndexStatus,
    getProjectSecrets,
    updateProjectSecretName
  };
};
