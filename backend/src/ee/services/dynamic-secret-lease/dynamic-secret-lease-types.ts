import { TDynamicSecretLeases } from "@app/db/schemas";
import { TDynamicSecretWithMetadata, TProjectPermission } from "@app/lib/types";

export enum DynamicSecretLeaseStatus {
  FailedDeletion = "Failed to delete"
}

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
  }>;
  listLeases: (arg: TListDynamicSecretLeasesDTO) => Promise<TDynamicSecretLeases[]>;
  revokeLease: (arg: TDeleteDynamicSecretLeaseDTO) => Promise<TDynamicSecretLeases>;
  renewLease: (arg: TRenewDynamicSecretLeaseDTO) => Promise<TDynamicSecretLeases>;
  getLeaseDetails: (arg: TDetailsDynamicSecretLeaseDTO) => Promise<{
    dynamicSecret: {
      id: string;
      name: string;
      version: number;
      type: string;
      defaultTTL: string;
      maxTTL: string | null | undefined;
      encryptedInput: Buffer;
      folderId: string;
      status: string | null | undefined;
      statusDetails: string | null | undefined;
      createdAt: Date;
      updatedAt: Date;
    };
    version: number;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    externalEntityId: string;
    expireAt: Date;
    dynamicSecretId: string;
    status?: string | null | undefined;
    config?: unknown;
    statusDetails?: string | null | undefined;
  }>;
};
