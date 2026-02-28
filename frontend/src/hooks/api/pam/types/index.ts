import { OrderByDirection } from "../../generic/types";
import {
  PamAccountOrderBy,
  PamAccountView,
  PamResourceOrderBy,
  PamResourceType,
  PamSessionStatus
} from "../enums";
import { TActiveDirectoryAccount, TActiveDirectoryResource } from "./active-directory-resource";
import { TAwsIamAccount, TAwsIamResource } from "./aws-iam-resource";
import { TKubernetesAccount, TKubernetesResource } from "./kubernetes-resource";
import { TMySQLAccount, TMySQLResource } from "./mysql-resource";
import { TPostgresAccount, TPostgresResource } from "./postgres-resource";
import { TRedisAccount, TRedisResource } from "./redis-resource";
import { TSSHAccount, TSSHResource } from "./ssh-resource";
import { TWindowsAccount, TWindowsResource } from "./windows-server-resource";

export * from "./active-directory-resource";
export * from "./aws-iam-resource";
export * from "./kubernetes-resource";
export * from "./mysql-resource";
export * from "./postgres-resource";
export * from "./redis-resource";
export * from "./ssh-resource";
export * from "./windows-server-resource";

export type TPamResource =
  | TPostgresResource
  | TMySQLResource
  | TRedisResource
  | TSSHResource
  | TAwsIamResource
  | TKubernetesResource
  | TWindowsResource
  | TActiveDirectoryResource;

export type TPamAccount =
  | TPostgresAccount
  | TMySQLAccount
  | TRedisAccount
  | TSSHAccount
  | TAwsIamAccount
  | TKubernetesAccount
  | TWindowsAccount
  | TActiveDirectoryAccount;

export type TPamFolder = {
  id: string;
  projectId: string;
  parentId?: string | null;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Session log types
export type TPamCommandLog = {
  input: string;
  output: string;
  timestamp: string;
};

export type TTerminalEvent = {
  timestamp: string;
  eventType: "input" | "output" | "resize" | "error";
  data: string; // Base64 encoded binary data
  elapsedTime: number; // Seconds since session start (for replay)
};

export type THttpRequestEvent = {
  timestamp: string;
  requestId: string;
  eventType: "request";
  headers: Record<string, string[]>;
  method: string;
  url: string;
  body?: string;
};

export type THttpResponseEvent = {
  timestamp: string;
  requestId: string;
  eventType: "response";
  headers: Record<string, string[]>;
  status: string;
  body?: string;
};

export type THttpEvent = THttpRequestEvent | THttpResponseEvent;

export type TPamSessionLog = TPamCommandLog | TTerminalEvent | THttpEvent;

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
  logs: TPamSessionLog[];
};

// Resource DTOs
export type TListPamResourcesDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: PamResourceOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
  filterResourceTypes?: string;
};

export type TCreatePamResourceDTO = Pick<
  TPamResource,
  "name" | "connectionDetails" | "resourceType" | "gatewayId" | "projectId"
> & {
  adServerResourceId?: string | null;
};

export type TUpdatePamResourceDTO = Partial<
  Pick<TPamResource, "name" | "connectionDetails" | "gatewayId">
> & {
  resourceId: string;
  resourceType: PamResourceType;
  adServerResourceId?: string | null;
};

export type TDeletePamResourceDTO = {
  resourceId: string;
  resourceType: PamResourceType;
};

// Account DTOs
export type TListPamAccountsDTO = {
  projectId: string;
  accountView?: PamAccountView;
  offset?: number;
  limit?: number;
  orderBy?: PamAccountOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
  filterResourceIds?: string;
};

export type TCreatePamAccountDTO = Pick<
  TPamAccount,
  "name" | "description" | "credentials" | "projectId" | "resourceId" | "folderId" | "requireMfa"
> & {
  resourceType: PamResourceType;
  metadata?: Record<string, unknown>;
};

export type TUpdatePamAccountDTO = Partial<
  Pick<TPamAccount, "name" | "description" | "credentials" | "requireMfa">
> & {
  accountId: string;
  resourceType: PamResourceType;
  metadata?: Record<string, unknown>;
};

export type TDeletePamAccountDTO = {
  accountId: string;
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
