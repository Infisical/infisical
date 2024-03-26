export enum DynamicSecretLeaseStatus {
  FailedDeletion = "Failed to delete"
}

export type TDynamicSecretLease = {
  id: string;
  version: number;
  expireAt: string;
  dynamicSecretId: string;
  status?: DynamicSecretLeaseStatus;
  statusDetails?: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateDynamicSecretLeaseDTO = {
  dynamicSecretName: string;
  projectSlug: string;
  ttl?: string;
  path: string;
  environmentSlug: string;
};

export type TRenewDynamicSecretLeaseDTO = {
  leaseId: string;
  dynamicSecretName: string;
  ttl?: string;
  projectSlug: string;
  path: string;
  environmentSlug: string;
};

export type TListDynamicSecretLeaseDTO = {
  dynamicSecretName: string;
  projectSlug: string;
  path: string;
  environmentSlug: string;
  enabled?: boolean;
};

export type TRevokeDynamicSecretLeaseDTO = {
  leaseId: string;
  dynamicSecretName: string;
  projectSlug: string;
  path: string;
  environmentSlug: string;
  isForced?: boolean;
};
