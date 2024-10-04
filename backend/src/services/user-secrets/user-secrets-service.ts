import { TUserSecretsDALFactory } from "./user-secrets-dal";

type TUserSecretsServiceFactoryDep = {
  userSecretsDAL: TUserSecretsDALFactory;
};

export type TUserSecretsServiceFactory = ReturnType<typeof userSecretsServiceFactory>;

export const userSecretsServiceFactory = ({ userSecretsDAL }: TUserSecretsServiceFactoryDep) => {
  const { getSecrets } = userSecretsDAL;
  const createSecrets = userSecretsDAL.createSecret;
  return { getSecrets, createSecrets };
};
