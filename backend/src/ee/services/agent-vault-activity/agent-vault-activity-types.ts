import { OrgServiceActor } from "@app/lib/types";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";

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
};

export type TRecordChunkDTO = {
  proxyId: string;
  sessionId: string;
  chunk: TAgentVaultActivityChunkInput;
};

export type TGetSessionActivityDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
  sessionId: string;
  limit: number;
  before?: string;
  /** Window over the chunk's startedAt. A filter only; the cursor stays on chunkId. */
  from?: Date;
  to?: Date;
  /** Reads by when the server received each chunk instead of paging back through the session. */
  receivedAfter?: Date;
};

export type TGetActivityConfigDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
};

export type TUpdateActivityConfigDTO = TGetActivityConfigDTO & {
  /** The app connection lookup runs its own org and project checks, which need the full actor. */
  actor: OrgServiceActor;
  enabled?: boolean;
  appConnectionId?: string | null;
  bucket?: string;
  region?: AWSRegion;
  keyPrefix?: string;
};

/** The bucket coordinates a storage call needs, once the config row has been checked for completeness. */
export type TResolvedActivityStorageConfig = {
  appConnectionId: string;
  bucket: string;
  region: AWSRegion;
  keyPrefix: string | null;
};
