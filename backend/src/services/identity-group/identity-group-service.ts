import { TIdentityGroupDALFactory } from "./identity-group-dal";

type TIdentityGroupServiceFactoryDep = {
  identityGroupDAL: TIdentityGroupDALFactory;
};

export type TIdentityGroupServiceFactory = ReturnType<typeof identityGroupServiceFactory>;

export const identityGroupServiceFactory = ({ identityGroupDAL }: TIdentityGroupServiceFactoryDep) => {
  return {};
};
