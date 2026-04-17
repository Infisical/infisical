import { OrderByDirection } from "../../generic/types";
import {
  PamAccountOrderBy,
  PamAccountView,
  PamResourceOrderBy,
  PamResourceType,
  PamSessionStatus,
  TerminalChannelType
} from "../enums";
import { TAwsIamAccount, TAwsIamResource } from "./aws-iam-resource";
import { TSessionSummaryConfig } from "./base-resource";
import { TKubernetesAccount, TKubernetesResource } from "./kubernetes-resource";
import { TMongoDBAccount, TMongoDBResource } from "./mongodb-resource";
import { TMsSQLAccount, TMsSQLResource } from "./mssql-resource";
import { TMySQLAccount, TMySQLResource } from "./mysql-resource";
import { TPostgresAccount, TPostgresResource } from "./postgres-resource";
import { TRedisAccount, TRedisResource } from "./redis-resource";
import { TSSHAccount, TSSHResource } from "./ssh-resource";
import { TWindowsAccount, TWindowsResource } from "./windows-server-resource";

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
  | TWindowsResource;

export type TPamAccount =
  | TPostgresAccount
  | TMySQLAccount
  | TMsSQLAccount
  | TRedisAccount
  | TMongoDBAccount
  | TSSHAccount
  | TAwsIamAccount
  | TKubernetesAccount
  | TWindowsAccount;

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
  channelType?: TerminalChannelType; // Optional for backwards compatibility with existing logs
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

export type TPamSessionAiInsights = {
  summary: string;
  warnings: { text: string; logIndex?: number }[];
};

export type TPamSession = {
  id: string;
  projectId: string;
  accountId?: string | null;
  resourceId?: string | null;
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
  gatewayIdentityId?: string | null;
  gatewayId?: string | null;
  aiInsightsStatus?: string | null;
  aiInsightsError?: string | null;
  aiInsights?: TPamSessionAiInsights | null;
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
  domainId?: string | null;
  metadata?: { key: string; value: string }[];
};

export type { TSessionSummaryConfig };

export type TUpdatePamResourceDTO = Partial<
  Pick<TPamResource, "name" | "connectionDetails" | "gatewayId">
> & {
  resourceId: string;
  resourceType: PamResourceType;
  domainId?: string | null;
  metadata?: { key: string; value: string }[];
  rotationAccountCredentials?: { username: string; password: string } | null;
  sessionSummaryConfig?: TSessionSummaryConfig;
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
  filterDomainIds?: string;
  metadataFilter?: Array<{ key: string; value?: string }>;
};

export type TCreatePamAccountDTO = Pick<
  TPamAccount,
  "name" | "description" | "credentials" | "projectId" | "resourceId" | "folderId" | "requireMfa"
> & {
  parentType: string;
  domainId?: string;
  internalMetadata?: Record<string, unknown>;
  metadata?: { key: string; value: string }[];
  policyId?: string | null;
};

export type TUpdatePamAccountDTO = Partial<
  Pick<TPamAccount, "name" | "description" | "credentials" | "requireMfa">
> & {
  accountId: string;
  parentType: string;
  internalMetadata?: Record<string, unknown>;
  metadata?: { key: string; value: string }[];
  policyId?: string | null;
};

export type TDeletePamAccountDTO = {
  accountId: string;
  parentType: string;
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

export type TPamSessionLogsPage = {
  logs: TPamSessionLog[];
  hasMore: boolean;
  batchCount: number;
};

// Account Policy types
export enum PamAccountPolicyRuleType {
  CommandBlocking = "command-blocking",
  SessionLogMasking = "session-log-masking"
}

export type TPamAccountPolicyRuleConfig = {
  patterns: string[];
};

export type TPamAccountPolicyRules = Partial<
  Record<PamAccountPolicyRuleType, TPamAccountPolicyRuleConfig>
>;

export type TPamAccountPolicy = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  rules: TPamAccountPolicyRules;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TCreatePamAccountPolicyDTO = {
  projectId: string;
  name: string;
  description?: string;
  rules: TPamAccountPolicyRules;
};

export type TUpdatePamAccountPolicyDTO = {
  policyId: string;
  name?: string;
  description?: string | null;
  rules?: TPamAccountPolicyRules;
  isActive?: boolean;
};

export type TDeletePamAccountPolicyDTO = {
  policyId: string;
};
