import { TProjectPermission } from "@app/lib/types";

export enum DynamicSecretLeaseStatus {
  FailedDeletion = "Failed to delete"
}

export type TCreateDynamicSecretLeaseDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  ttl?: string;
  projectSlug: string;
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
