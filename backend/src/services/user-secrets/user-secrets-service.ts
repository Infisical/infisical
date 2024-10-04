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
      fields: encryptedFields.ciphertext,
      iv: encryptedFields.iv,
      tag: encryptedFields.tag
    });
  };

  const getSecrets = async (orgId: string) => {
    const secrets = await userSecretsDAL.getSecrets(orgId);
    if (!secrets) return [];
    return transformToWebLoginSecretApiResponse(secrets);
  };
  return {
    getSecrets,
    createSecrets,
    updateSecrets: userSecretsDAL.updateSecrets,
    deleteSecret: userSecretsDAL.deleteSecret
  };
};
