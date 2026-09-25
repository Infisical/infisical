import { OrgServiceActor } from "@app/lib/types";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import { AgentVaultActivityStorageUnavailableReason } from "./agent-vault-activity-constants";

export type TAgentVaultActivityChunkInput = {
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
  chunk: TAgentVaultActivityChunkInput;
};

export type TSessionActivityScope = {
  projectId: string;
  ctx: TAgentVaultActorContext;
  sessionId: string;
};

type TSessionActivityDTO = TSessionActivityScope & {
  limit: number;
};

export type TListSessionActivityDTO = TSessionActivityDTO & {
  before?: string;
  from?: Date;
  to?: Date;
};

export type TTailSessionActivityDTO = TSessionActivityDTO & {
  receivedAfter?: Date;
};

export type TActivityLoggingDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
};

export type TUpdateActivityLoggingSettingsDTO = TActivityLoggingDTO & {
  actor: OrgServiceActor;
  enabled?: boolean;
  appConnectionId?: string | null;
  bucket?: string;
  region?: AWSRegion;
  keyPrefix?: string;
};

export type TResolvedActivityStorageConfig = {
  appConnectionId: string;
  bucket: string;
  region: AWSRegion;
  keyPrefix: string | null;
};

export type TAgentVaultActivityStorageUnavailable = {
  reason: (typeof AgentVaultActivityStorageUnavailableReason)[keyof typeof AgentVaultActivityStorageUnavailableReason];
  message: string | null;
};
