import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

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
  secretDAL: Pick<TSecretDALFactory, "bulkUpdate">;
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
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetProjectBlindIndexStatusDTO) => {
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const secretCount = await secretBlindIndexDAL.countOfSecretsWithNullSecretBlindIndex(projectId);
    return Number(secretCount);
  };

  const getProjectSecrets = async ({
    projectId,
    actorId,
    actorAuthMethod,
    actorOrgId,
    actor
  }: TGetProjectSecretsDTO) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Insufficient privileges, user must be admin" });
    }

    const secrets = await secretBlindIndexDAL.findAllSecretsByProjectId(projectId);
    return secrets;
  };

  const updateProjectSecretName = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    secretsToUpdate
  }: TUpdateProjectSecretNameDTO) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Insufficient privileges, user must be admin" });
    }

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg)
      throw new NotFoundError({ message: `Blind index for project with ID '${projectId}' not found` });

    const secrets = await secretBlindIndexDAL.findSecretsByProjectId(
      projectId,
      secretsToUpdate.map(({ secretId }) => secretId)
    );
    if (secrets.length !== secretsToUpdate.length)
      throw new NotFoundError({ message: "One or more secrets to update not found" });

    const operations = await Promise.all(
      secretsToUpdate.map(async ({ secretName, secretId: id }) => {
        const secretBlindIndex = await generateSecretBlindIndexBySalt(secretName, blindIndexCfg);
        return { filter: { id }, data: { secretBlindIndex } };
      })
    );

    await secretBlindIndexDAL.transaction(async (tx) => {
      await secretDAL.bulkUpdate(operations, tx);
    });
  };

  return {
    getSecretBlindIndexStatus,
    getProjectSecrets,
    updateProjectSecretName
  };
};
