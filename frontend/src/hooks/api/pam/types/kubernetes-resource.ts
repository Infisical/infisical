import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export enum KubernetesAuthMethod {
  ServiceAccountToken = "service-account-token"
}

export type TKubernetesConnectionDetails = {
  url: string;
  sslRejectUnauthorized: boolean;
  sslCertificate?: string;
};

export type TKubernetesServiceAccountTokenCredentials = {
  authMethod: KubernetesAuthMethod.ServiceAccountToken;
  serviceAccountName: string;
  serviceAccountToken: string;
};

export type TKubernetesCredentials = TKubernetesServiceAccountTokenCredentials;

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
