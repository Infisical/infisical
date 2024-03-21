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
  slug: string;
  projectId: string;
  ttl?: string;
  path: string;
  environment: string;
};

export type TRenewDynamicSecretLeaseDTO = {
  leaseId: string;
  slug: string;
  ttl?: string;
  projectId: string;
  path: string;
  environment: string;
};

export type TListDynamicSecretLeaseDTO = {
  slug: string;
  projectId: string;
  path: string;
  environment: string;
  enabled?: boolean;
};

export type TRevokeDynamicSecretLeaseDTO = {
  leaseId: string;
  slug: string;
  projectId: string;
  path: string;
  environment: string;
};
