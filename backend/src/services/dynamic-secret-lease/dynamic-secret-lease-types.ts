import { TProjectPermission } from "@app/lib/types";

export type TCreateDynamicSecretLeaseDTO = {
  slug: string;
  path: string;
  environment: string;
  ttl?: string;
} & TProjectPermission;

export type TListDynamicSecretLeasesDTO = {
  slug: string;
  path: string;
  environment: string;
} & TProjectPermission;

export type TDeleteDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environment: string;
} & TProjectPermission;

export type TRenewDynamicSecretLeaseDTO = {
  leaseId: string;
  path: string;
  environment: string;
  ttl?: string;
} & TProjectPermission;
