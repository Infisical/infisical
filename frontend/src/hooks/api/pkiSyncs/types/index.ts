import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TAwsCertificateManagerPkiSync } from "./aws-certificate-manager-sync";
import { TAwsElasticLoadBalancerPkiSync } from "./aws-elastic-load-balancer-sync";
import { TAwsSecretsManagerPkiSync } from "./aws-secrets-manager-sync";
import { TAzureKeyVaultPkiSync } from "./azure-key-vault-sync";
import { TChefPkiSync } from "./chef-sync";
import { TCloudflareCustomCertificatePkiSync } from "./cloudflare-custom-certificate-sync";

export type TPkiSyncOption = {
  name: string;
  destination: PkiSync;
  canImportCertificates: boolean;
  canRemoveCertificates: boolean;
  enterprise?: boolean;
  defaultCertificateNameSchema?: string;
  forbiddenCharacters?: string;
  allowedCharacterPattern?: string;
  maxCertificateNameLength?: number;
  minCertificateNameLength?: number;
};

export type TPkiSync =
  | TAzureKeyVaultPkiSync
  | TAwsCertificateManagerPkiSync
  | TAwsSecretsManagerPkiSync
  | TAwsElasticLoadBalancerPkiSync
  | TChefPkiSync
  | TCloudflareCustomCertificatePkiSync;

export type TListPkiSyncs = { pkiSyncs: TPkiSync[] };

export type TListPkiSyncOptions = { pkiSyncOptions: TPkiSyncOption[] };

type TCreatePkiSyncDTOBase = {
  name: string;
  description?: string;
  connectionId: string;
  syncOptions: {
    canImportCertificates: boolean;
    canRemoveCertificates: boolean;
    certificateNamePrefix?: string;
    certificateNameSchema?: string;
    preserveArn?: boolean;
    enableVersioning?: boolean;
    preserveItemOnRenewal?: boolean;
    updateExistingCertificates?: boolean;
    preserveSecretOnRenewal?: boolean;
    fieldMappings?: {
      certificate: string;
      privateKey: string;
      certificateChain: string;
      caCertificate: string;
    };
  };
  isAutoSyncEnabled: boolean;
  subscriberId?: string | null;
  certificateIds?: string[];
  projectId: string;
};

export type TCreatePkiSyncDTO = TCreatePkiSyncDTOBase & {
  destination: PkiSync;
  destinationConfig: {
    vaultBaseUrl?: string;
    region?: string;
    dataBagName?: string;
    loadBalancerArn?: string;
    listeners?: Array<{
      listenerArn: string;
      port?: number;
      protocol?: string;
    }>;
    zoneId?: string;
  };
};

export type TUpdatePkiSyncDTO = Partial<Omit<TCreatePkiSyncDTO, "projectId">> & {
  syncId: string;
  projectId: string;
};

export type TDeletePkiSyncDTO = {
  syncId: string;
  projectId: string;
  destination: PkiSync;
};

export type TTriggerPkiSyncSyncCertificatesDTO = {
  syncId: string;
  destination: PkiSync;
  projectId: string;
};

export type TTriggerPkiSyncImportCertificatesDTO = {
  syncId: string;
  destination: PkiSync;
  projectId: string;
};

export type TTriggerPkiSyncRemoveCertificatesDTO = {
  syncId: string;
  destination: PkiSync;
  projectId: string;
};

export * from "./aws-certificate-manager-sync";
export * from "./aws-elastic-load-balancer-sync";
export * from "./aws-secrets-manager-sync";
export * from "./azure-key-vault-sync";
export * from "./chef-sync";
export * from "./cloudflare-custom-certificate-sync";
export * from "./common";
