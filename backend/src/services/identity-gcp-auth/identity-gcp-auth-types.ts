import { TProjectPermission } from "@app/lib/types";

export type TLoginGcpAuthDTO = {
  identityId: string;
  jwt: string;
};

export type TAttachGcpAuthDTO = {
  identityId: string;
  credentials: string;
  type: "iam" | "gce";
  allowedServiceAccounts: string;
  allowedProjects: string;
  allowedZones: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TUpdateGcpAuthDTO = {
  identityId: string;
  credentials?: string;
  type?: "iam" | "gce";
  allowedServiceAccounts?: string;
  allowedProjects?: string;
  allowedZones?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetGcpAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGcpGceIdTokenPayload = {
  aud: string;
  azp: string;
  email: string;
  email_verified: boolean;
  exp: number;
  google: {
    compute_engine: {
      instance_creation_timestamp: number;
      instance_id: string;
      instance_name: string;
      project_id: string;
      project_number: number;
      zone: string;
    };
  };
  iat: number;
  iss: string;
  sub: string;
};

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
