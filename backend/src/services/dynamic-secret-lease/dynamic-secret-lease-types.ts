import { TProjectPermission } from "@app/lib/types";

export enum DynamicSecretLeaseStatus {
  FailedDeletion = "Failed to delete"
}

export type TCreateDynamicSecretLeaseDTO = {
  slug: string;
  path: string;
  environment: string;
  ttl?: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TDetailsDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environment: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TListDynamicSecretLeasesDTO = {
  slug: string;
  path: string;
  environment: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environment: string;
  projectSlug: string;
  isForced?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TRenewDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environment: string;
  ttl?: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;
