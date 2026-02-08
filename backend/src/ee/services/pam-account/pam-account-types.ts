import { OrderByDirection, TProjectPermission } from "@app/lib/types";

import { TPamAccount } from "../pam-resource/pam-resource-types";
import { PamAccountOrderBy, PamAccountView } from "./pam-account-enums";

// DTOs
export type TCreateAccountDTO = Pick<
  TPamAccount,
  "name" | "description" | "credentials" | "folderId" | "resourceId" | "rotationIntervalSeconds" | "requireMfa"
> & {
  rotationEnabled?: boolean;
};

export type TUpdateAccountDTO = Partial<Omit<TCreateAccountDTO, "folderId" | "resourceId">> & {
  accountId: string;
};

export type TAccessAccountDTO = {
  accountPath: string;
  projectId: string;
  actorEmail: string;
  actorIp: string;
  actorName: string;
  actorUserAgent: string;
  duration: number;
  mfaSessionId?: string;
  clientType?: "cli" | "web";
};

export type TListAccountsDTO = {
  accountPath: string;
  accountView: PamAccountView;
  search?: string;
  orderBy?: PamAccountOrderBy;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
  filterResourceIds?: string[];
} & TProjectPermission;

export type TGetAccountByIdDTO = {
  accountId: string;
} & Omit<TProjectPermission, "projectId">;
