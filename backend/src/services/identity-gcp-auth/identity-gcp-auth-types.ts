import { TProjectPermission } from "@app/lib/types";

export type TLoginGcpAuthDTO = {
  identityId: string;
  jwt: string;
  organizationSlug?: string;
};

export type TAttachGcpAuthDTO = {
  identityId: string;
  type: "iam" | "gce";
  allowedServiceAccounts: string;
  allowedProjects: string;
  allowedZones: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateGcpAuthDTO = {
  identityId: string;
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

type TComputeEngineDetails = {
  instance_creation_timestamp: number;
  instance_id: string;
  instance_name: string;
  project_id: string;
  project_number: number;
  zone: string;
};

export type TGcpIdentityDetails = {
  email: string;
  computeEngineDetails?: TComputeEngineDetails;
};

export type TGcpIdTokenPayload = {
  aud: string;
  azp: string;
  email: string;
  email_verified: boolean;
  exp: number;
  google?: {
    compute_engine: TComputeEngineDetails;
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

export type TRevokeGcpAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;
