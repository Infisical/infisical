import { decryptFields, encryptFields } from "./user-secrets.helpers";
import { TUserSecretsDALFactory } from "./user-secrets-dal";
import { CreateSecretFuncParamsType, GetSecretsServiceReturnType } from "./user-secrets-types";

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

  const getSecrets = async (orgId: string): Promise<GetSecretsServiceReturnType[] | undefined> => {
    const secrets = await userSecretsDAL.getSecrets(orgId);
    if (secrets) {
      return secrets.map((secret) => {
        const decryptedFields = decryptFields(secret.fields, secret.iv, secret.tag);
        return {
          title: secret.title,
          fields: decryptedFields
        };
      });
    }
  };
  return { getSecrets, createSecrets };
};
