import { z } from "zod";

import { OrgServiceActor, TGenericPermission } from "@app/lib/types";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { AgentVaultSessionLogStorageUnavailableReason } from "./agent-vault-session-log-enums";
import type {
  AgentVaultSessionLogChunkCreateSchema,
  AgentVaultSessionLogSettingsUpdateSchema
} from "./agent-vault-session-log-schemas";

// Who is asking. Every method's input starts from one of these.
export type TAgentVaultSessionLogScoped = { projectId: string; ctx: TGenericPermission };

export type TAgentVaultSessionScoped = TAgentVaultSessionLogScoped & { sessionId: string };

// One input per service method, named after the method.
export type TRecordChunkDTO = {
  proxyId: string;
  sessionId: string;
  chunk: z.infer<typeof AgentVaultSessionLogChunkCreateSchema>;
};

export type TListSessionLogsDTO = TAgentVaultSessionScoped & {
  limit: number;
  before?: string;
  from?: Date;
  to?: Date;
};

export type TTailSessionLogsDTO = TAgentVaultSessionScoped & {
  limit: number;
  receivedAfter?: Date;
};

export type TUpdateSessionLogSettingsDTO = TAgentVaultSessionLogScoped & {
  actor: OrgServiceActor;
} & z.infer<typeof AgentVaultSessionLogSettingsUpdateSchema>;

// Storage: a bucket setup with every required field filled in, and why a session's logs can't be read.
export type TResolvedSessionLogStorageConfig = {
  appConnectionId: string;
  bucket: string;
  region: AWSRegion;
  keyPrefix: string | null;
};

export type TAgentVaultSessionLogStorageUnavailable = {
  reason: AgentVaultSessionLogStorageUnavailableReason;
  message: string | null;
};
