import { TGenericPermission } from "@app/lib/types";

export type TOidcLoginDTO = {
  externalId: string;
  email: string;
  firstName: string;
  lastName?: string;
  orgId: string;
};

export type TGetOidcCfgDTO = {
  type: "internal" | "external";
  orgSlug: string;
} & TGenericPermission;

export type TCreateOidcCfgDTO = {
  issuer: string;
  authorizationEndpoint: string;
  jwksUri: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  clientId: string;
  clientSecret: string;
  isActive: boolean;
  orgSlug: string;
} & TGenericPermission;

export type TUpdateOidcCfgDTO = Partial<{
  issuer: string;
  authorizationEndpoint: string;
  jwksUri: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  clientId: string;
  clientSecret: string;
  isActive: boolean;
  orgSlug: string;
}> &
  TGenericPermission;
