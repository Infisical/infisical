import { TProjectPermission } from "@app/lib/types";

export type TLoginKubernetesAuthDTO = {
  identityId: string;
  jwt: string;
};

export type TAttachKubernetesAuthDTO = {
  identityId: string;
  kubernetesHost: string;
  caCert: string;
  tokenReviewerJwt?: string;
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  gatewayId?: string | null;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateKubernetesAuthDTO = {
  identityId: string;
  kubernetesHost?: string;
  caCert?: string;
  tokenReviewerJwt?: string | null;
  allowedNamespaces?: string;
  allowedNames?: string;
  allowedAudience?: string;
  gatewayId?: string | null;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetKubernetesAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

type TCreateTokenReviewSuccessResponse = {
  authenticated: true;
  user: {
    username: string;
    uid: string;
    groups: string[];
  };
  audiences: string[];
};

type TCreateTokenReviewErrorResponse = {
  error: string;
};

export type TCreateTokenReviewResponse = {
  apiVersion: "authentication.k8s.io/v1";
  kind: "TokenReview";
  spec: {
    token: string;
  };
  status: TCreateTokenReviewSuccessResponse | TCreateTokenReviewErrorResponse;
};

export type TRevokeKubernetesAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;
