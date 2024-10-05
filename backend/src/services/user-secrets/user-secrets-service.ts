import { TUserSecretCredentialsUpdate } from "@app/db/schemas";

import { encryptFields } from "./user-secrets.helpers";
import { TUserSecretsDALFactory } from "./user-secrets-dal";
import { transformToWebLoginSecretApiResponse } from "./user-secrets-transformer";
import { CreateSecretFuncParamsType } from "./user-secrets-types";

type TUserSecretsServiceFactoryDep = {
  userSecretsDAL: TUserSecretsDALFactory;
};

export type TUserSecretsServiceFactory = ReturnType<typeof userSecretsServiceFactory>;

export const userSecretsServiceFactory = ({ userSecretsDAL }: TUserSecretsServiceFactoryDep) => {
  const createSecrets = async (data: CreateSecretFuncParamsType) => {
    const encryptedFields = encryptFields(data.fields);
    await userSecretsDAL.createSecret({
      ...data,
      fields: encryptedFields
    });
  };

  const getSecrets = async (orgId: string, userId: string, credentialType?: string) => {
    const secrets = credentialType
      ? await userSecretsDAL.getSecretByCredentialType(orgId, userId, credentialType)
      : await userSecretsDAL.getSecrets(orgId, userId);
    if (!secrets) return [];
    return transformToWebLoginSecretApiResponse(secrets);
  };

  const updateSecrets = async (orgId: string, fields: Pick<TUserSecretCredentialsUpdate, "fields">) => {
    const encryptedFields = encryptFields(fields);
    await userSecretsDAL.updateSecrets(orgId, {
      fields: encryptedFields
    });
  };

  return {
    getSecrets,
    createSecrets,
    updateSecrets,
    deleteSecret: userSecretsDAL.deleteSecret
  };
};
