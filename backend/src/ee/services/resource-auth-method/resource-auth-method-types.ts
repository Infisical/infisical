import { OrgServiceActor } from "@app/lib/types";

import { ResourceAuthMethodType, ResourceRef } from "./resource-auth-method-fns";

export type TAwsAuthMethodConfig = {
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
};

export type TKubernetesAuthMethodConfig = {
  kubernetesHost: string;
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  verifyTlsCertificate: boolean;
  caCertificate?: string;
  tokenReviewerJwt?: string;
};

// A missing key means "keep the stored value"; null means "clear it".
export type TEncryptedKubernetesSecrets = {
  encryptedKubernetesCaCertificate?: Buffer | null;
  encryptedKubernetesTokenReviewerJwt?: Buffer | null;
};

// The CA certificate round-trips because it is public key material. The reviewer JWT is a live
// cluster credential, so only its presence is reported.
export type TKubernetesAuthMethodConfigView = Omit<
  TKubernetesAuthMethodConfig,
  "caCertificate" | "tokenReviewerJwt"
> & {
  id: string;
  caCertificate: string;
  hasTokenReviewerJwt: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TSetAuthMethodInput =
  | ({ method: typeof ResourceAuthMethodType.Aws } & TAwsAuthMethodConfig)
  | ({ method: typeof ResourceAuthMethodType.Kubernetes } & TKubernetesAuthMethodConfig)
  | { method: typeof ResourceAuthMethodType.Token };

export type TSetAuthMethodDTO = {
  resource: ResourceRef;
  authMethod: TSetAuthMethodInput;
  actor: OrgServiceActor;
};

export type TGetAuthMethodDTO = {
  resource: ResourceRef;
  actor: OrgServiceActor;
};

export type TMintTokenDTO = TGetAuthMethodDTO;
export type TRevokeTokenDTO = TGetAuthMethodDTO;

export type TLoginWithAwsDTO = {
  resource: ResourceRef;
  iamHttpRequestMethod: string;
  iamRequestBody: string;
  iamRequestHeaders: string;
};

export type TLoginWithKubernetesDTO = {
  resource: ResourceRef;
  jwt: string;
};

export type TLoginWithTokenDTO = {
  token: string;
  expectedResourceType: "gateway" | "relay" | "kmip";
};

export type TAuthMethodView =
  | {
      method: typeof ResourceAuthMethodType.Aws;
      config: TAwsAuthMethodConfig & { id: string; createdAt: Date; updatedAt: Date };
    }
  | {
      method: typeof ResourceAuthMethodType.Kubernetes;
      config: TKubernetesAuthMethodConfigView;
    }
  | {
      method: typeof ResourceAuthMethodType.Token;
      config: Record<string, never>;
    }
  | {
      method: typeof ResourceAuthMethodType.Identity;
      config: { identityId: string; identityName: string | null };
    };
