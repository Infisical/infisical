import { PamResourceType, PamSessionStatus } from "../enums";
import { TPostgresAccount, TPostgresResource } from "./postgres-resource";

export * from "./postgres-resource";

export type TPamResource = TPostgresResource;

export type TPamAccount = TPostgresAccount;

export type TPamFolder = {
  id: string;
  projectId: string;
  parentId?: string | null;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TPamSession = {
  id: string;
  projectId: string;
  accountId?: string | null;
  resourceType: PamResourceType;
  resourceName: string;
  accountName: string;
  userId?: string | null;
  actorName: string;
  actorEmail: string;
  actorIp: string;
  actorUserAgent: string;
  status: PamSessionStatus;
  expiresAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  commandLogs: {
    input: string;
    output: string;
    timestamp: string;
  }[];
};

// Resource DTOs
export type TCreatePamResourceDTO = Pick<
  TPamResource,
  "name" | "connectionDetails" | "resourceType" | "gatewayId" | "projectId"
>;

export type TUpdatePamResourceDTO = Partial<
  Pick<TPamResource, "name" | "connectionDetails" | "gatewayId">
> & {
  resourceId: string;
  resourceType: PamResourceType;
};

export type TDeletePamResourceDTO = {
  resourceId: string;
  resourceType: PamResourceType;
};

// Account DTOs
export type TCreatePamAccountDTO = Pick<
  TPamAccount,
  "name" | "description" | "credentials" | "projectId" | "resourceId" | "folderId"
> & {
  resourceType: PamResourceType;
};

export type TUpdatePamAccountDTO = Partial<
  Pick<TPamAccount, "name" | "description" | "credentials">
> & {
  accountId: string;
  resourceId: string;
  resourceType: PamResourceType;
};

export type TDeletePamAccountDTO = {
  accountId: string;
  resourceId: string;
  resourceType: PamResourceType;
};

// Folder DTOs
export type TCreatePamFolderDTO = Pick<
  TPamFolder,
  "name" | "description" | "parentId" | "projectId"
>;

export type TUpdatePamFolderDTO = Partial<Pick<TPamFolder, "name" | "description">> & {
  folderId: string;
};

export type TDeletePamFolderDTO = {
  folderId: string;
};
