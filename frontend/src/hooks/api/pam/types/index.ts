import { OrderByDirection } from "../../generic/types";
import {
  PamAccountOrderBy,
  PamAccountType,
  PamAccountView,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  PamResourceType,
  PamSessionStatus,
  SessionChannelType
} from "../enums";

export type PamFolderPermissionSet = [
  PamResourcePermissionActions,
  PamResourcePermissionSub.PamResource
];

// New model types

export type TPamAccount = {
  id: string;
  name: string;
  description: string | null;
  folderId: string;
  folderName: string | null;
  templateId: string;
  templateName: string;
  templateAccessPolicy: unknown;
  templateSettings: unknown;
  accountType: PamAccountType;
  gatewayId: string | null;
  gatewayPoolId: string | null;
  recordingConnectionId: string | null;
  connectionDetails: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type TPamFolder = {
  id: string;
  parentId?: string | null;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TPamAccountTemplate = {
  id: string;
  name: string;
  description?: string | null;
  accountType: PamAccountType;
  accessPolicy: unknown;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
};

// Session log types

export type TPamCommandLog = {
  input: string;
  output: string;
  timestamp: string;
};

export type TSessionEvent = {
  timestamp: string;
  eventType: "input" | "output" | "resize" | "error";
  channelType?: SessionChannelType;
  data: string;
  elapsedTime: number;
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

export type TPamSessionLog = TPamCommandLog | TSessionEvent | THttpEvent;

export type TPamSessionAiInsights = {
  summary: string;
  warnings: { text: string; logIndex?: number }[];
};

export type TPamSession = {
  id: string;
  accountId?: string | null;
  accountType?: PamAccountType | null;
  resourceId?: string | null;
  resourceType: PamResourceType;
  resourceName: string;
  accountName: string;
  folderName?: string | null;
  selectedHost?: string | null;
  accessMethod?: string | null;
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
  gatewayIdentityId?: string | null;
  gatewayId?: string | null;
  aiInsightsStatus?: string | null;
  aiInsightsError?: string | null;
  aiInsights?: TPamSessionAiInsights | null;
  reason?: string | null;
};

export type TPamSessionLogsPage = {
  logs: TPamSessionLog[];
  hasMore: boolean;
  batchCount: number;
};

export type TAccessiblePamAccount = {
  id: string;
  name: string;
  description: string | null;
  folderId: string | null;
  templateId: string;
  folderName: string | null;
  templateName: string;
  accountType: PamAccountType;
  createdAt: string;
  updatedAt: string;
};

export type TListAccessiblePamAccountsDTO = {
  offset?: number;
  limit?: number;
  search?: string;
  folderId?: string;
  accountType?: string;
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
};

export type TCreatePamFolderDTO = Pick<TPamFolder, "name" | "description" | "parentId"> & {
  projectId: string;
};

export type TUpdatePamFolderDTO = Partial<Pick<TPamFolder, "name" | "description">> & {
  folderId: string;
};

export type TDeletePamFolderDTO = {
  folderId: string;
};
