import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export enum KubernetesAuthMethod {
  ServiceAccountToken = "service-account-token",
  GatewayKubernetesAuth = "gateway-kubernetes-auth"
}

export type TKubernetesConnectionDetails = {
  url: string;
  sslRejectUnauthorized: boolean;
  sslCertificate?: string;
};

export type TKubernetesServiceAccountTokenCredentials = {
  authMethod: KubernetesAuthMethod.ServiceAccountToken;
  serviceAccountToken: string;
};

export type TKubernetesGatewayAuthCredentials = {
  authMethod: KubernetesAuthMethod.GatewayKubernetesAuth;
  namespace: string;
  serviceAccountName: string;
};

export type TKubernetesCredentials =
  | TKubernetesServiceAccountTokenCredentials
  | TKubernetesGatewayAuthCredentials;

// Resources
export type TKubernetesResource = TBasePamResource & {
  resourceType: PamResourceType.Kubernetes;
} & {
  connectionDetails: TKubernetesConnectionDetails;
  rotationAccountCredentials?: TKubernetesCredentials | null;
};

// Accounts
export type TKubernetesAccount = TBasePamAccount & {
  credentials: TKubernetesCredentials;
};
