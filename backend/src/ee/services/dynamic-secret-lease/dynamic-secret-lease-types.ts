import { TDynamicSecretLeases } from "@app/db/schemas";
import { TDynamicSecretWithMetadata, TProjectPermission } from "@app/lib/types";

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
} & Omit<TProjectPermission, "projectId">;

export type TDetailsDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TListDynamicSecretLeasesDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
  isForced?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TRenewDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environmentSlug: string;
  ttl?: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TDynamicSecretKubernetesLeaseConfig = {
  namespace?: string;
};

export type TDynamicSecretLeaseConfig = TDynamicSecretKubernetesLeaseConfig;

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
