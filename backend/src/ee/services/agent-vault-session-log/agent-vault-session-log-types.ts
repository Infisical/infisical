import { z } from "zod";

import type { TActorContext } from "@app/domains/lib/actor-context";

import type {
  AgentVaultSessionLogChunkCreateSchema,
  AgentVaultSessionLogSettingsUpdateSchema
} from "./agent-vault-session-log-schemas";

export type TAgentVaultSessionLogScoped = { projectId: string; ctx: TActorContext };

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

export type TUpdateSessionLogSettingsDTO = TAgentVaultSessionLogScoped &
  z.infer<typeof AgentVaultSessionLogSettingsUpdateSchema>;
