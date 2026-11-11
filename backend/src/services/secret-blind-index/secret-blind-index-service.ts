import { ProjectMembershipRole } from "@app/db/schemas";
import { TSecretsDomain } from "@app/domains/secrets-manager/secrets/ce/module";
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
  secretsDomain: Pick<TSecretsDomain, "getSecretsPermission">;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  secretDAL: Pick<TSecretDALFactory, "bulkUpdate">;
};

export type TSecretBlindIndexServiceFactory = ReturnType<typeof secretBlindIndexServiceFactory>;

export const secretBlindIndexServiceFactory = ({
  secretBlindIndexDAL,
  secretsDomain,
  secretDAL
}: TSecretBlindIndexServiceFactoryDep) => {
  const getSecretBlindIndexStatus = async ({ actor, projectId }: TGetProjectBlindIndexStatusDTO) => {
    await secretsDomain.getSecretsPermission({ actor, projectId });

    const secretCount = await secretBlindIndexDAL.countOfSecretsWithNullSecretBlindIndex(projectId);
    return Number(secretCount);
  };

  const getProjectSecrets = async ({ projectId, actor }: TGetProjectSecretsDTO) => {
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });
    if (!permission.hasRole({ slug: ProjectMembershipRole.Admin })) {
      throw new ForbiddenRequestError({ message: "Insufficient privileges, user must be admin" });
    }

    const secrets = await secretBlindIndexDAL.findAllSecretsByProjectId(projectId);
    return secrets;
  };

  const updateProjectSecretName = async ({ projectId, actor, secretsToUpdate }: TUpdateProjectSecretNameDTO) => {
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });
    if (!permission.hasRole({ slug: ProjectMembershipRole.Admin })) {
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
