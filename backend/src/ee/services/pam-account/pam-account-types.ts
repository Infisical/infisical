import { z } from "zod";

import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { ResourceMetadataNonEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";

import { TPamAccount } from "../pam-resource/pam-resource-types";
import { PamAccountOrderBy, PamAccountView } from "./pam-account-enums";

// DTOs
export type TCreateAccountDTO = Pick<
  TPamAccount,
  "name" | "description" | "credentials" | "folderId" | "requireMfa"
> & {
  resourceId?: string;
  domainId?: string;
  internalMetadata?: Record<string, unknown>;
  metadata?: z.input<typeof ResourceMetadataNonEncryptionSchema>;
  policyId?: string | null;
};

export type TUpdateAccountDTO = Partial<Omit<TCreateAccountDTO, "folderId" | "resourceId">> & {
  accountId: string;
};

export type TAccessAccountDTO = {
  resourceName: string;
  accountName: string;
  projectId: string;
  actorEmail: string;
  actorIp: string;
  actorName: string;
  actorUserAgent: string;
  duration: number;
  mfaSessionId?: string;
};

export type TListAccountsDTO = {
  accountView: PamAccountView;
  search?: string;
  orderBy?: PamAccountOrderBy;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
  filterResourceIds?: string[];
  filterDomainIds?: string[];
  metadataFilter?: Array<{ key: string; value?: string }>;
} & TProjectPermission;

export type TGetAccountByIdDTO = {
  accountId: string;
} & Omit<TProjectPermission, "projectId">;

export type TViewAccountCredentialsDTO = {
  accountId: string;
  mfaSessionId?: string;
} & Omit<TProjectPermission, "projectId">;
