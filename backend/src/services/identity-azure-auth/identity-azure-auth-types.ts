import { TProjectPermission } from "@app/lib/types";

export type TLoginAzureAuthDTO = {
  identityId: string;
  jwt: string;
  organizationSlug?: string;
};

export type TAttachAzureAuthDTO = {
  identityId: string;
  tenantId: string;
  resource: string;
  allowedServicePrincipalIds: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAzureAuthDTO = {
  identityId: string;
  tenantId?: string;
  resource?: string;
  allowedServicePrincipalIds?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetAzureAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TAzureJwksUriResponse = {
  keys: {
    kty: string;
    use: string;
    kid: string;
    x5t: string;
    n: string;
    e: string;
    x5c: string[];
  }[];
};

type TUserPayload = {
  aud: string;
  iss: string;
  iat: number;
  nbf: number;
  exp: number;
  acr: string;
  aio: string;
  amr: string[];
  appid: string;
  appidacr: string;
  family_name: string;
  given_name: string;
  groups: string[];
  idtyp: string;
  ipaddr: string;
  name: string;
  oid: string;
  puid: string;
  rh: string;
  scp: string;
  sub: string;
  tid: string;
  unique_name: string;
  upn: string;
  uti: string;
  ver: string;
  wids: string[];
  xms_cae: string;
  xms_cc: string[];
  xms_filter_index: string[];
  xms_rd: string;
  xms_ssm: string;
  xms_tcdt: number;
};

type TAppPayload = {
  aud: string;
  iss: string;
  iat: number;
  nbf: number;
  exp: number;
  aio: string;
  appid: string;
  appidacr: string;
  idp: string;
  idtyp: string;
  oid: string; // service principal id
  rh: string;
  sub: string;
  tid: string;
  uti: string;
  ver: string;
  xms_cae: string;
  xms_cc: string[];
  xms_rd: string;
  xms_ssm: string;
  xms_tcdt: number;
};

export type TAzureAuthJwtPayload = TUserPayload | TAppPayload;

export type TDecodedAzureAuthJwt = {
  header: {
    type: string;
    alg: string;
    x5t: string;
    kid: string;
  };
  payload: TAzureAuthJwtPayload;
  signature: string;
  metadata: {
    [key: string]: string;
  };
};

export type TRevokeAzureAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;
