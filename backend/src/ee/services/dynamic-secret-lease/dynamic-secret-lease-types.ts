import { TDynamicSecretLeases } from "@app/db/schemas";
import { TActorInput, TDynamicSecretWithMetadata } from "@app/lib/types";

export enum DynamicSecretLeaseStatus {
  FailedDeletion = "Failed to delete"
}

export type ActorIdentityAttributes = {
  name: string;
};

export type TCreateDynamicSecretLeaseDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  ttl?: string;
  projectSlug: string;
  config?: TDynamicSecretLeaseConfig;
} & TActorInput;

export type TDetailsDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
} & TActorInput;

export type TListDynamicSecretLeasesDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
} & TActorInput;

export type TDeleteDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
  isForced?: boolean;
} & TActorInput;

export type TRenewDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environmentSlug: string;
  ttl?: string;
  projectSlug: string;
} & TActorInput;

export type TDynamicSecretKubernetesLeaseConfig = {
  namespace?: string;
};

export type TDynamicSecretSshLeaseConfig = {
  principals?: string[];
};

export type TDynamicSecretLeaseConfig = TDynamicSecretKubernetesLeaseConfig & TDynamicSecretSshLeaseConfig;

export type TDynamicSecretLeaseServiceFactory = {
  create: (arg: TCreateDynamicSecretLeaseDTO) => Promise<{
    lease: TDynamicSecretLeases;
    dynamicSecret: TDynamicSecretWithMetadata;
    data: unknown;
    projectId: string;
    environment: string;
    secretPath: string;
  }>;
  listLeases: (arg: TListDynamicSecretLeasesDTO) => Promise<{
    leases: TDynamicSecretLeases[];
    dynamicSecret: TDynamicSecretWithMetadata;
    projectId: string;
    environment: string;
    secretPath: string;
  }>;
  revokeLease: (arg: TDeleteDynamicSecretLeaseDTO) => Promise<{
    lease: TDynamicSecretLeases;
    dynamicSecret: TDynamicSecretWithMetadata;
    projectId: string;
    environment: string;
    secretPath: string;
  }>;
  renewLease: (arg: TRenewDynamicSecretLeaseDTO) => Promise<{
    lease: TDynamicSecretLeases;
    dynamicSecret: TDynamicSecretWithMetadata;
    projectId: string;
    environment: string;
    secretPath: string;
  }>;
  getLeaseDetails: (arg: TDetailsDynamicSecretLeaseDTO) => Promise<{
    dynamicSecret: TDynamicSecretWithMetadata;
    lease: TDynamicSecretLeases;
    projectId: string;
    environment: string;
    secretPath: string;
  }>;
};
