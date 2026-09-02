import { OrgServiceActor } from "@app/lib/types";

import { ResourceAuthMethodType, ResourceRef, TKubernetesTokenReviewMode } from "./resource-auth-method-fns";

export type TAwsAuthMethodConfig = {
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
};

export type TKubernetesAuthMethodConfig = {
  // Omitted only in gateway review mode, where the gateway calls its own API server.
  kubernetesHost?: string | null;
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  verifyTlsCertificate: boolean;
  caCertificate?: string;
  tokenReviewerJwt?: string;
  tokenReviewMode?: TKubernetesTokenReviewMode;
  gatewayV2Id?: string | null;
  gatewayPoolId?: string | null;
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
  "caCertificate" | "tokenReviewerJwt" | "kubernetesHost" | "tokenReviewMode" | "gatewayV2Id" | "gatewayPoolId"
> & {
  id: string;
  // Always present on read, empty when the review runs through a gateway's own service account.
  kubernetesHost: string;
  tokenReviewMode: string;
  gatewayId: string | null;
  gatewayPoolId: string | null;
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
  expectedResourceType: "gateway" | "relay" | "kmip" | "agentVaultProxy";
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
