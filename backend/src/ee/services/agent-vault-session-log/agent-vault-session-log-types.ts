import { z } from "zod";

import { OrgServiceActor, TGenericPermission } from "@app/lib/types";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import type {
  AgentVaultSessionLogChunkCreateSchema,
  AgentVaultSessionLogSettingsUpdateSchema
} from "./agent-vault-session-log-schemas";

export type TAgentVaultSessionLogScoped = { projectId: string; ctx: TGenericPermission };

export type TAgentVaultSessionScoped = TAgentVaultSessionLogScoped & { sessionId: string };

export type TCreateChunkUploadUrlDTO = {
  proxyId: string;
  sessionId: string;
  chunk: z.infer<typeof AgentVaultSessionLogChunkCreateSchema>;
};

export type TListSessionLogsDTO = TAgentVaultSessionScoped & {
  cursor?: string;
  from?: Date;
  to?: Date;
};

export type TTailSessionLogsDTO = TAgentVaultSessionScoped & {
  cursor?: string;
};

export type TUpdateSessionLogSettingsDTO = TAgentVaultSessionLogScoped & {
  actor: OrgServiceActor;
} & z.infer<typeof AgentVaultSessionLogSettingsUpdateSchema>;

export type TResolvedSessionLogStorageConfig = {
  appConnectionId: string;
  bucket: string;
  region: AWSRegion;
  keyPrefix: string | null;
};
