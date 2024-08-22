import { TGenericPermission } from "@app/lib/types";

export enum OIDCConfigurationType {
  CUSTOM = "custom",
  DISCOVERY_URL = "discoveryURL"
}

export type TOidcLoginDTO = {
  externalId: string;
  email: string;
  firstName: string;
  lastName?: string;
  orgId: string;
  callbackPort?: string;
};

export type TGetOidcCfgDTO =
  | ({
      type: "external";
      orgSlug: string;
    } & TGenericPermission)
  | {
      type: "internal";
      orgSlug: string;
    };

export type TCreateOidcCfgDTO = {
  issuer?: string;
  authorizationEndpoint?: string;
  discoveryURL?: string;
  configurationType: OIDCConfigurationType;
  allowedEmailDomains?: string;
  jwksUri?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  clientId: string;
  clientSecret: string;
  isActive: boolean;
  orgSlug: string;
} & TGenericPermission;

export type TUpdateOidcCfgDTO = Partial<{
  issuer: string;
  authorizationEndpoint: string;
  allowedEmailDomains: string;
  discoveryURL: string;
  jwksUri: string;
  configurationType: OIDCConfigurationType;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  clientId: string;
  clientSecret: string;
  isActive: boolean;
  orgSlug: string;
}> &
  TGenericPermission;
