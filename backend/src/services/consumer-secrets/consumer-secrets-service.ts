import { TConsumerSecretsDALFactory } from "./consumer-secrets-dal";

type TConsumerSecretsServiceFactoryDep = {
  consumerSecretsDAL: TConsumerSecretsDALFactory;
};

export type TConsumerSecretsServiceFactory = ReturnType<typeof consumerSecretsServiceFactory>;

export const consumerSecretsServiceFactory = ({ consumerSecretsDAL }: TConsumerSecretsServiceFactoryDep) => {
  return {};
};
