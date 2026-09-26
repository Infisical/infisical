import { OrgServiceActor } from "@app/lib/types";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import { AgentVaultSessionLogStorageUnavailableReason } from "./agent-vault-session-log-constants";

export type TAgentVaultSessionLogChunkInput = {
  chunkId: string;
  startedAt: Date;
  endedAt: Date;
  firstSeq: number;
  lastSeq: number;
  recordCount: number;
  droppedCount: number;
  ciphertextBytes: number;
  iv: string;
  ciphertextSha256: string;
};

export type TRecordChunkDTO = {
  proxyId: string;
  sessionId: string;
  chunk: TAgentVaultSessionLogChunkInput;
};

export type TSessionLogsScope = {
  projectId: string;
  ctx: TAgentVaultActorContext;
  sessionId: string;
};

type TSessionLogsDTO = TSessionLogsScope & {
  limit: number;
};

export type TListSessionLogsDTO = TSessionLogsDTO & {
  before?: string;
  from?: Date;
  to?: Date;
};

export type TTailSessionLogsDTO = TSessionLogsDTO & {
  receivedAfter?: Date;
};

export type TSessionLogSettingsDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
};

export type TUpdateSessionLogSettingsDTO = TSessionLogSettingsDTO & {
  actor: OrgServiceActor;
  enabled?: boolean;
  appConnectionId?: string | null;
  bucket?: string;
  region?: AWSRegion;
  keyPrefix?: string;
};

export type TResolvedSessionLogStorageConfig = {
  appConnectionId: string;
  bucket: string;
  region: AWSRegion;
  keyPrefix: string | null;
};

export type TAgentVaultSessionLogStorageUnavailable = {
  reason: (typeof AgentVaultSessionLogStorageUnavailableReason)[keyof typeof AgentVaultSessionLogStorageUnavailableReason];
  message: string | null;
};
