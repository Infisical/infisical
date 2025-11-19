import { PamResourceType, PamSessionStatus } from "../enums";
import { TMcpAccount, TMcpResource } from "./mcp-resource";
import { TMySQLAccount, TMySQLResource } from "./mysql-resource";
import { TPostgresAccount, TPostgresResource } from "./postgres-resource";
import { TSSHAccount, TSSHResource } from "./ssh-resource";

export * from "./mcp-resource";
export * from "./mysql-resource";
export * from "./postgres-resource";
export * from "./ssh-resource";

export type TPamResource = TPostgresResource | TMySQLResource | TSSHResource | TMcpResource;

export type TPamAccount = TPostgresAccount | TMySQLAccount | TSSHAccount | TMcpAccount;

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

export type TPamSessionLog = TPamCommandLog | TTerminalEvent;

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
  | "name"
  | "description"
  | "credentials"
  | "projectId"
  | "resourceId"
  | "folderId"
  | "rotationEnabled"
  | "rotationIntervalSeconds"
  | "requireMfa"
> & {
  resourceType: PamResourceType;
};

export type TUpdatePamAccountDTO = Partial<
  Pick<
    TPamAccount,
    | "name"
    | "description"
    | "credentials"
    | "rotationEnabled"
    | "rotationIntervalSeconds"
    | "requireMfa"
  >
> & {
  accountId: string;
  resourceType: PamResourceType;
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

// MCP Server OAuth DTOs
export type TMcpServerOAuthAuthorizeDTO = {
  accountId: string;
};

export type TMcpServerOAuthCallbackDTO = {
  accountId: string;
  code: string;
  projectId?: string; // Optional, for cache invalidation
};

// MCP Server Configuration Types
export type TMcpServerConfiguration = {
  version: number;
  statement: {
    toolsAllowed: string[];
  };
};

export type TMcpServerTool = {
  name: string;
  description?: string;
};

// MCP Server Configuration DTOs
export type TGetMcpServerConfigDTO = {
  accountId: string;
};

export type TUpdateMcpServerConfigDTO = {
  accountId: string;
  config: TMcpServerConfiguration;
};

export type TGetMcpServerToolsDTO = {
  accountId: string;
};
