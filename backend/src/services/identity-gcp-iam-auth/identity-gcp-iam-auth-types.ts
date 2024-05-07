import { TProjectPermission } from "@app/lib/types";

export type TLoginGcpIamAuthDTO = {
  identityId: string;
  jwt: string;
};

export type TAttachGcpIamAuthDTO = {
  identityId: string;
  allowedServiceAccounts: string;
  allowedProjects: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TUpdateGcpIamAuthDTO = {
  identityId: string;
  allowedServiceAccounts?: string;
  allowedProjects?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetGcpIamAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDecodedGcpIamAuthJwt = {
  header: {
    alg: string;
    kid: string;
    typ: string;
  };
  payload: {
    sub: string;
    aud: string;
  };
  signature: string;
  metadata: {
    [key: string]: string;
  };
};
