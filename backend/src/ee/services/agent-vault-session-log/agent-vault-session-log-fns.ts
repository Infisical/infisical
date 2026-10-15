import RE2 from "re2";

import { ProjectType } from "@app/db/schemas";
import { defineStorageNamespace } from "@app/services/object-storage/object-storage-namespace-fns";

import { AGENT_VAULT_SESSION_LOG_CHUNK_ID_PATTERN } from "./agent-vault-session-log-constants";

export const AgentVaultSessionLogsNamespace = defineStorageNamespace({
  id: "agent-vault.session-logs",
  product: ProjectType.AgentVault,
  path: "sessions/{sessionId}/logs/{file}"
});

const MAX_REV = 9_999_999_999_999;

export const chunkIdTimeMs = (chunkId: string) => parseInt(chunkId.slice(0, 8) + chunkId.slice(9, 13), 16);

// S3 lists names in ascending order only, so names start with the time counted down: newest first.
export const toRev = (ms: number) => String(MAX_REV - Math.min(Math.max(Math.floor(ms), 0), MAX_REV)).padStart(13, "0");

export const buildSessionLogObjectName = ({ proxyId, chunkId }: { proxyId: string; chunkId: string }) =>
  `${toRev(chunkIdTimeMs(chunkId))}_${chunkId}.${proxyId}.json.enc`;

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SESSION_LOG_OBJECT_NAME_REGEX = new RE2(
  `^(\\d{13})_(${AGENT_VAULT_SESSION_LOG_CHUNK_ID_PATTERN})\\.(${UUID_PATTERN})\\.json\\.enc$`
);

// Anything else in the folder is skipped: only Infisical names objects there, through the links it signs.
export const parseSessionLogObjectKey = (folder: string, key: string) => {
  if (!key.startsWith(folder)) return null;
  const match = SESSION_LOG_OBJECT_NAME_REGEX.exec(key.slice(folder.length));
  if (!match) return null;
  const [, rev, chunkId, proxyId] = match;
  const lastRecordAtMs = chunkIdTimeMs(chunkId);
  if (rev !== toRev(lastRecordAtMs)) return null;
  return { chunkId, proxyId, lastRecordAt: new Date(lastRecordAtMs) };
};
