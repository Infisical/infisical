import { OrderByDirection, TProjectPermission } from "@app/lib/types";

import { TPamAccount } from "../pam-resource/pam-resource-types";

// DTOs
export type TCreateAccountDTO = Pick<
  TPamAccount,
  "name" | "description" | "credentials" | "folderId" | "resourceId" | "rotationEnabled" | "rotationIntervalSeconds"
>;

export type TUpdateAccountDTO = Partial<Omit<TCreateAccountDTO, "folderId" | "resourceId">> & {
  accountId: string;
};

export type TAccessAccountDTO = {
  accountId: string;
  actorEmail: string;
  actorIp: string;
  actorName: string;
  actorUserAgent: string;
  duration: number;
};

export type TListAccountsDTO = {
  accountPath: string;
  accountView: PamAccountView;
  search?: string;
  orderBy?: PamAccountOrderBy;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
} & TProjectPermission;

export enum PamAccountOrderBy {
  Name = "name"
}

export enum PamAccountView {
  Flat = "flat",
  Nested = "nested"
}
