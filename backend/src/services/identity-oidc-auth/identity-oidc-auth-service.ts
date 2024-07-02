import { TIdentityOidcAuthDALFactory } from "./identity-oidc-auth-dal";

type TIdentityOidcAuthServiceFactoryDep = {
  identityOidcAuthDAL: TIdentityOidcAuthDALFactory;
};

export type TIdentityOidcAuthServiceFactory = ReturnType<typeof identityOidcAuthServiceFactory>;

export const identityOidcAuthServiceFactory = ({ identityOidcAuthDAL }: TIdentityOidcAuthServiceFactoryDep) => {
  return {};
};
