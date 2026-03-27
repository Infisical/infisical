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
import { TMongoDBAccount, TMongoDBResource } from "./mongodb-resource";
import { TMsSQLAccount, TMsSQLResource } from "./mssql-resource";
import { TMySQLAccount, TMySQLResource } from "./mysql-resource";
import { TPostgresAccount, TPostgresResource } from "./postgres-resource";
import { TRedisAccount, TRedisResource } from "./redis-resource";
import { TSSHAccount, TSSHResource } from "./ssh-resource";
import { TWindowsAccount, TWindowsResource } from "./windows-server-resource";

export * from "./active-directory-resource";
export * from "./aws-iam-resource";
export * from "./kubernetes-resource";
export * from "./mongodb-resource";
export * from "./mssql-resource";
export * from "./mysql-resource";
export * from "./postgres-resource";
export * from "./redis-resource";
export * from "./ssh-resource";
export * from "./windows-server-resource";

export type TPamResource =
  | TPostgresResource
  | TMySQLResource
  | TMsSQLResource
  | TRedisResource
  | TMongoDBResource
  | TSSHResource
  | TAwsIamResource
  | TKubernetesResource
  | TWindowsResource
  | TActiveDirectoryResource;

export type TPamAccount =
  | TPostgresAccount
  | TMySQLAccount
  | TMsSQLAccount
  | TRedisAccount
  | TMongoDBAccount
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
  metadataFilter?: Array<{ key: string; value?: string }>;
};

export type TCreatePamResourceDTO = Pick<
  TPamResource,
  "name" | "connectionDetails" | "resourceType" | "gatewayId" | "projectId"
> & {
  adServerResourceId?: string | null;
  metadata?: { key: string; value: string }[];
};

export type TUpdatePamResourceDTO = Partial<
  Pick<TPamResource, "name" | "connectionDetails" | "gatewayId">
> & {
  resourceId: string;
  resourceType: PamResourceType;
  adServerResourceId?: string | null;
  metadata?: { key: string; value: string }[];
  rotationAccountCredentials?: { username: string; password: string } | null;
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
  metadataFilter?: Array<{ key: string; value?: string }>;
};

export type TCreatePamAccountDTO = Pick<
  TPamAccount,
  "name" | "description" | "credentials" | "projectId" | "resourceId" | "folderId" | "requireMfa"
> & {
  resourceType: PamResourceType;
  internalMetadata?: Record<string, unknown>;
  metadata?: { key: string; value: string }[];
};

export type TUpdatePamAccountDTO = Partial<
  Pick<TPamAccount, "name" | "description" | "credentials" | "requireMfa">
> & {
  accountId: string;
  resourceType: PamResourceType;
  internalMetadata?: Record<string, unknown>;
  metadata?: { key: string; value: string }[];
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

export type TPamAccountDependency = {
  id: string;
  accountId: string;
  resourceId: string;
  dependencyType: string;
  name: string;
  displayName?: string | null;
  state?: string | null;
  data: Record<string, unknown>;
  source: string;
  isRotationSyncEnabled: boolean;
  syncStatus?: string | null;
  lastSyncedAt?: string | null;
  lastSyncMessage?: string | null;
  resourceName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TPamRotationRule = {
  id: string;
  resourceId: string;
  name?: string | null;
  namePattern: string;
  enabled: boolean;
  intervalSeconds?: number | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export type TCreatePamRotationRuleDTO = {
  resourceId: string;
  name?: string;
  namePattern: string;
  enabled: boolean;
  intervalSeconds?: number | null;
};

export type TUpdatePamRotationRuleDTO = {
  resourceId: string;
  ruleId: string;
  name?: string | null;
  namePattern?: string;
  enabled?: boolean;
  intervalSeconds?: number | null;
};

export type TDeletePamRotationRuleDTO = {
  resourceId: string;
  ruleId: string;
};

export type TReorderPamRotationRulesDTO = {
  resourceId: string;
  ruleIds: string[];
};

export type TPamResourceDependency = TPamAccountDependency & {
  accountName: string | null;
};
