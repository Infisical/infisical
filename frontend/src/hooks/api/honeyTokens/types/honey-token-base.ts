import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { HoneyTokenStatus } from "@app/hooks/api/honeyTokens/enums";

export type THoneyTokenBase = {
  id: string;
  name: string;
  description?: string | null;
  status: HoneyTokenStatus;
  projectId: string;
  folderId: string;
  createdAt: string;
  updatedAt: string;
};

export type TDashboardHoneyTokenBase = THoneyTokenBase & {
  environment: {
    id: string;
    name: string;
    slug: string;
  };
  folder: {
    path: string;
  };
};

export type THoneyTokenOptionBase<U, T extends AppConnection> = {
  name: string;
  type: U;
  connection: T;
  template: {
    secretsMapping: Record<string, string>;
  };
};

export type THoneyTokenCredentialsResponseBase<U, T> = {
  type: U;
  honeyTokenId: string;
  credentials: T;
};

export type THoneyTokenDetails = THoneyTokenBase & {
  type: string;
  secretsMapping: Record<string, string>;
  environment: {
    id: string;
    name: string;
    slug: string;
  } | null;
  folder: {
    path: string;
  } | null;
  openEvents: number;
};

export type THoneyTokenEvent = {
  id: string;
  honeyTokenId: string;
  eventType: string;
  metadata: {
    username?: string;
    eventName?: string;
    eventSource?: string;
    sourceIp?: string;
    userAgent?: string;
    awsRegion?: string;
    eventTime?: string;
    accountId?: string;
    accessKeyId?: string;
    errorCode?: string;
    errorMessage?: string;
    eventId?: string;
    requestParameters?: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
};
