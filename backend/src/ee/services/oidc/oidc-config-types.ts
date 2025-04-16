import { TGenericPermission } from "@app/lib/types";

export enum OIDCConfigurationType {
  CUSTOM = "custom",
  DISCOVERY_URL = "discoveryURL"
}

export enum OIDCJWTSignatureAlgorithm {
  RS256 = "RS256",
  HS256 = "HS256",
  RS512 = "RS512"
}

export type TOidcLoginDTO = {
  externalId: string;
  email: string;
  firstName: string;
  lastName?: string;
  orgId: string;
  callbackPort?: string;
  groups?: string[];
  manageGroupMemberships?: boolean | null;
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
  manageGroupMemberships: boolean;
  jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm;
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
  manageGroupMemberships: boolean;
  jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm;
}> &
  TGenericPermission;
